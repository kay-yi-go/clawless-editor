mod git;

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::mpsc::{self, Sender};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Emitter, Manager, State, WindowEvent};
use tauri_plugin_autostart::{ManagerExt, MacosLauncher};
use tauri_plugin_notification::NotificationExt;
use walkdir::WalkDir;

use crate::git::{full_sync, SyncReport, SyncState};

const DEFAULT_SYNC_INTERVAL_SECS: u64 = 30 * 60;

const VAULT_PALETTE: &[&str] = &[
    "#FF66B3", "#6A5ACD", "#1E90FF", "#FFCEE3", "#BFB6E8", "#B3D7FF",
    "#22C55E", "#F59E0B", "#EC4899", "#06B6D4",
];

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(tag = "kind", rename_all = "lowercase")]
enum DirFilter {
    All,
    Last { n: u32, unit: String },
    This { unit: String },
}

#[derive(Serialize, Deserialize, Clone, Debug)]
struct Vault {
    id: String,
    name: String,
    path: PathBuf,
    #[serde(default)]
    github_remote: Option<String>,
    #[serde(default)]
    github_pat: Option<String>,
    #[serde(default)]
    open_tabs: Vec<String>,
    #[serde(default)]
    active_tab_path: Option<String>,
    #[serde(default)]
    bookmarks: Vec<String>,
    #[serde(default)]
    color: Option<String>,
    #[serde(default)]
    default_dir_filter: Option<DirFilter>,
}

#[derive(Serialize, Deserialize)]
struct AppConfig {
    #[serde(default)]
    vaults: Vec<Vault>,
    #[serde(default)]
    active_vault_id: Option<String>,

    #[serde(default, skip_serializing_if = "Option::is_none")]
    vault_root: Option<PathBuf>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    bookmarks: Vec<String>,

    #[serde(default = "default_sync_interval")]
    sync_interval_seconds: u64,
    #[serde(default = "default_true")]
    sync_enabled: bool,
    #[serde(default = "default_true")]
    autostart_enabled: bool,
    #[serde(default = "default_backend_url")]
    backend_url: String,
    #[serde(default)]
    backend_key: String,
    #[serde(default = "default_archive_threshold_days")]
    archive_threshold_days: u32,
}

fn default_true() -> bool {
    true
}
fn default_sync_interval() -> u64 {
    DEFAULT_SYNC_INTERVAL_SECS
}
fn default_backend_url() -> String {
    "http://127.0.0.1:8787".to_string()
}
fn default_archive_threshold_days() -> u32 {
    30
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            vaults: Vec::new(),
            active_vault_id: None,
            vault_root: None,
            bookmarks: Vec::new(),
            sync_interval_seconds: DEFAULT_SYNC_INTERVAL_SECS,
            sync_enabled: true,
            autostart_enabled: true,
            backend_url: default_backend_url(),
            backend_key: String::new(),
            archive_threshold_days: 30,
        }
    }
}

impl AppConfig {
    fn active_vault_path(&self) -> Option<PathBuf> {
        let id = self.active_vault_id.as_ref()?;
        self.vaults.iter().find(|v| &v.id == id).map(|v| v.path.clone())
    }

    fn active_vault(&self) -> Option<&Vault> {
        let id = self.active_vault_id.as_ref()?;
        self.vaults.iter().find(|v| &v.id == id)
    }

    fn active_vault_mut(&mut self) -> Option<&mut Vault> {
        let id = self.active_vault_id.clone()?;
        self.vaults.iter_mut().find(|v| v.id == id)
    }
}

#[derive(Serialize)]
struct BackendConfig {
    url: String,
    key: String,
}

#[derive(Serialize, Deserialize)]
struct AppSettings {
    sync_interval_seconds: u64,
    sync_enabled: bool,
    autostart_enabled: bool,
    archive_threshold_days: u32,
}

#[derive(Deserialize)]
struct VaultPatch {
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    path: Option<PathBuf>,
    #[serde(default)]
    github_remote: Option<String>,
    #[serde(default)]
    github_pat: Option<String>,
    #[serde(default)]
    color: Option<String>,
}

#[derive(Serialize)]
struct VaultEntry {
    rel_path: String,
    is_dir: bool,
}

#[derive(Serialize)]
struct VaultFileMeta {
    rel_path: String,
    last_modified: String,
}

#[derive(Serialize, Deserialize)]
struct Session {
    open_tabs: Vec<String>,
    active_tab_path: Option<String>,
}

struct ConfigState(Mutex<AppConfig>);
struct SyncTrigger(Mutex<Option<Sender<()>>>);

fn new_vault_id() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    format!("v_{:x}", nanos)
}

fn color_for_id(id: &str) -> String {
    let hash: u32 = id.bytes().fold(0, |acc, b| acc.wrapping_add(b as u32));
    VAULT_PALETTE[(hash as usize) % VAULT_PALETTE.len()].to_string()
}

fn strip_unc_prefix(p: PathBuf) -> PathBuf {
    let s = p.to_string_lossy().to_string();
    if let Some(rest) = s.strip_prefix(r"\\?\UNC\") {
        return PathBuf::from(format!(r"\\{}", rest));
    }
    if let Some(rest) = s.strip_prefix(r"\\?\") {
        return PathBuf::from(rest);
    }
    p
}

fn config_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("config.json"))
}

fn migrate_legacy(cfg: &mut AppConfig) {
    if cfg.vaults.is_empty() {
        if let Some(legacy) = cfg.vault_root.take() {
            let path = strip_unc_prefix(legacy);
            let name = path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("vault")
                .to_string();
            let id = new_vault_id();
            let color = color_for_id(&id);
            let vault = Vault {
                id: id.clone(),
                name,
                path,
                github_remote: None,
                github_pat: None,
                open_tabs: Vec::new(),
                active_tab_path: None,
                bookmarks: std::mem::take(&mut cfg.bookmarks),
                color: Some(color),
                default_dir_filter: None,
            };
            cfg.vaults.push(vault);
            cfg.active_vault_id = Some(id);
        }
    }
    cfg.vault_root = None;
    cfg.bookmarks = Vec::new();

    for v in &mut cfg.vaults {
        v.path = strip_unc_prefix(std::mem::take(&mut v.path));
        if v.color.is_none() {
            v.color = Some(color_for_id(&v.id));
        }
    }

    if cfg.active_vault_id.is_none() {
        if let Some(first) = cfg.vaults.first() {
            cfg.active_vault_id = Some(first.id.clone());
        }
    }
}

fn load_config(app: &AppHandle) -> AppConfig {
    let Ok(path) = config_path(app) else {
        return AppConfig::default();
    };
    let mut cfg: AppConfig = fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default();
    migrate_legacy(&mut cfg);
    cfg
}

fn save_config(app: &AppHandle, cfg: &AppConfig) -> Result<(), String> {
    let path = config_path(app)?;
    let json = serde_json::to_string_pretty(cfg).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())
}

fn resolve_active_path(state: &State<'_, ConfigState>, rel: &str) -> Result<PathBuf, String> {
    let cfg = state.0.lock().unwrap();
    let root = cfg.active_vault_path().ok_or("no active vault")?;
    let rel_path = Path::new(rel);
    if rel_path.is_absolute()
        || rel_path
            .components()
            .any(|c| matches!(c, std::path::Component::ParentDir))
    {
        return Err("Invalid path".into());
    }
    let abs = root.join(rel_path);
    if !abs.starts_with(&root) {
        return Err("Path escapes vault".into());
    }
    Ok(abs)
}

#[tauri::command]
fn list_vaults(state: State<'_, ConfigState>) -> Vec<Vault> {
    state.0.lock().unwrap().vaults.clone()
}

#[tauri::command]
fn get_active_vault(state: State<'_, ConfigState>) -> Option<Vault> {
    state.0.lock().unwrap().active_vault().cloned()
}

#[tauri::command]
fn add_vault(
    path: PathBuf,
    name: Option<String>,
    github_remote: Option<String>,
    github_pat: Option<String>,
    state: State<'_, ConfigState>,
    app: AppHandle,
) -> Result<Vault, String> {
    let canon = path.canonicalize().map_err(|e| e.to_string())?;
    if !canon.is_dir() {
        return Err("Path is not a directory".into());
    }
    let cleaned = strip_unc_prefix(canon);
    let display_name = name.unwrap_or_else(|| {
        cleaned
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("vault")
            .to_string()
    });
    let id = new_vault_id();
    let color = color_for_id(&id);
    let vault = Vault {
        id: id.clone(),
        name: display_name,
        path: cleaned,
        github_remote: github_remote.filter(|s| !s.is_empty()),
        github_pat: github_pat.filter(|s| !s.is_empty()),
        open_tabs: Vec::new(),
        active_tab_path: None,
        bookmarks: Vec::new(),
        color: Some(color),
        default_dir_filter: None,
    };
    let mut cfg = state.0.lock().unwrap();
    if cfg.vaults.iter().any(|v| v.path == vault.path) {
        return Err("vault with this path already exists".into());
    }
    cfg.vaults.push(vault.clone());
    if cfg.active_vault_id.is_none() {
        cfg.active_vault_id = Some(id);
    }
    save_config(&app, &cfg)?;
    Ok(vault)
}

#[tauri::command]
fn remove_vault(
    id: String,
    state: State<'_, ConfigState>,
    app: AppHandle,
) -> Result<(), String> {
    let mut cfg = state.0.lock().unwrap();
    cfg.vaults.retain(|v| v.id != id);
    if cfg.active_vault_id.as_deref() == Some(id.as_str()) {
        cfg.active_vault_id = cfg.vaults.first().map(|v| v.id.clone());
    }
    save_config(&app, &cfg)
}

#[tauri::command]
fn update_vault(
    id: String,
    patch: VaultPatch,
    state: State<'_, ConfigState>,
    app: AppHandle,
) -> Result<Vault, String> {
    let mut cfg = state.0.lock().unwrap();
    let vault = cfg
        .vaults
        .iter_mut()
        .find(|v| v.id == id)
        .ok_or("vault not found")?;
    if let Some(name) = patch.name {
        vault.name = name;
    }
    if let Some(path) = patch.path {
        let canon = path.canonicalize().map_err(|e| e.to_string())?;
        if !canon.is_dir() {
            return Err("Path is not a directory".into());
        }
        vault.path = strip_unc_prefix(canon);
    }
    if let Some(remote) = patch.github_remote {
        vault.github_remote = if remote.is_empty() { None } else { Some(remote) };
    }
    if let Some(pat) = patch.github_pat {
        vault.github_pat = if pat.is_empty() { None } else { Some(pat) };
    }
    if let Some(color) = patch.color {
        vault.color = if color.is_empty() { None } else { Some(color) };
    }
    let updated = vault.clone();
    save_config(&app, &cfg)?;
    Ok(updated)
}

#[tauri::command]
fn set_active_vault(
    id: String,
    state: State<'_, ConfigState>,
    app: AppHandle,
) -> Result<(), String> {
    let mut cfg = state.0.lock().unwrap();
    if !cfg.vaults.iter().any(|v| v.id == id) {
        return Err("vault not found".into());
    }
    cfg.active_vault_id = Some(id);
    save_config(&app, &cfg)?;
    let _ = app.emit("active-vault-changed", ());
    Ok(())
}

#[tauri::command]
fn read_file(rel_path: String, state: State<'_, ConfigState>) -> Result<String, String> {
    let path = resolve_active_path(&state, &rel_path)?;
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_file(
    rel_path: String,
    content: String,
    state: State<'_, ConfigState>,
) -> Result<(), String> {
    let path = resolve_active_path(&state, &rel_path)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&path, content).map_err(|e| e.to_string())
}

#[tauri::command]
fn list_vault(state: State<'_, ConfigState>) -> Result<Vec<VaultEntry>, String> {
    let root = state
        .0
        .lock()
        .unwrap()
        .active_vault_path()
        .ok_or("no active vault")?;
    let mut out = Vec::new();
    for entry in WalkDir::new(&root)
        .into_iter()
        .filter_entry(|e| e.depth() == 0 || !e.file_name().to_string_lossy().starts_with('.'))
        .filter_map(|e| e.ok())
    {
        if entry.path() == root {
            continue;
        }
        let is_dir = entry.file_type().is_dir();
        let name = entry.file_name().to_string_lossy();
        if !is_dir && !name.ends_with(".md") {
            continue;
        }
        let rel = entry
            .path()
            .strip_prefix(&root)
            .map_err(|e| e.to_string())?;
        out.push(VaultEntry {
            rel_path: rel.to_string_lossy().replace('\\', "/"),
            is_dir,
        });
    }
    Ok(out)
}

fn format_mtime(meta: &fs::Metadata) -> String {
    use time::OffsetDateTime;
    let mtime = meta.modified().unwrap_or(SystemTime::UNIX_EPOCH);
    let dt = OffsetDateTime::from(mtime);
    format!(
        "{:04}-{:02}-{:02}",
        dt.year(),
        u8::from(dt.month()),
        dt.day()
    )
}

#[tauri::command]
fn list_vault_meta(state: State<'_, ConfigState>) -> Result<Vec<VaultFileMeta>, String> {
    let root = state
        .0
        .lock()
        .unwrap()
        .active_vault_path()
        .ok_or("no active vault")?;
    let mut out = Vec::new();
    for entry in WalkDir::new(&root)
        .into_iter()
        .filter_entry(|e| e.depth() == 0 || !e.file_name().to_string_lossy().starts_with('.'))
        .filter_map(|e| e.ok())
    {
        if !entry.file_type().is_file() {
            continue;
        }
        let name = entry.file_name().to_string_lossy();
        if !name.ends_with(".md") {
            continue;
        }
        let rel = entry
            .path()
            .strip_prefix(&root)
            .map_err(|e| e.to_string())?;
        let meta = entry.metadata().map_err(|e| e.to_string())?;
        out.push(VaultFileMeta {
            rel_path: rel.to_string_lossy().replace('\\', "/"),
            last_modified: format_mtime(&meta),
        });
    }
    Ok(out)
}

fn run_sync_and_emit(app: &AppHandle, vault: &Path) -> SyncReport {
    let _ = app.emit("sync-state", &SyncState::Syncing);
    let report = full_sync(vault).unwrap_or_else(|e| SyncReport {
        state: SyncState::Error,
        message: Some(e),
        conflict_files: vec![],
    });
    let _ = app.emit("sync-report", &report);
    let _ = app.emit("sync-state", &report.state);

    if let Some(tray) = app.tray_by_id("clawless-tray") {
        let tooltip = match report.state {
            SyncState::Idle => "Clawless — synced".to_string(),
            SyncState::Syncing => "Clawless — syncing…".to_string(),
            SyncState::Conflict => format!(
                "Clawless — {} conflict(s)",
                report.conflict_files.len()
            ),
            SyncState::Error => "Clawless — sync error".to_string(),
            SyncState::Disconnected => "Clawless — no remote".to_string(),
        };
        let _ = tray.set_tooltip(Some(&tooltip));
    }

    if report.state == SyncState::Conflict && !report.conflict_files.is_empty() {
        let files = report.conflict_files.join(", ");
        let _ = app
            .notification()
            .builder()
            .title("Clawless: conflicts detected")
            .body(format!("Resolve in editor: {}", files))
            .show();
    }

    report
}

#[tauri::command]
fn trigger_sync(trigger: State<'_, SyncTrigger>) -> Result<(), String> {
    if let Some(tx) = trigger.0.lock().unwrap().as_ref() {
        let _ = tx.send(());
    }
    Ok(())
}

#[tauri::command]
fn sync_now(state: State<'_, ConfigState>, app: AppHandle) -> Result<SyncReport, String> {
    let vault = state
        .0
        .lock()
        .unwrap()
        .active_vault_path()
        .ok_or("no active vault")?;
    Ok(run_sync_and_emit(&app, &vault))
}

#[tauri::command]
fn get_backend_config(state: State<'_, ConfigState>) -> BackendConfig {
    let cfg = state.0.lock().unwrap();
    BackendConfig {
        url: cfg.backend_url.clone(),
        key: cfg.backend_key.clone(),
    }
}

#[tauri::command]
fn set_backend_config(
    url: String,
    key: String,
    state: State<'_, ConfigState>,
    app: AppHandle,
) -> Result<(), String> {
    let mut cfg = state.0.lock().unwrap();
    cfg.backend_url = url;
    cfg.backend_key = key;
    save_config(&app, &cfg)
}

#[tauri::command]
fn get_settings(state: State<'_, ConfigState>) -> AppSettings {
    let cfg = state.0.lock().unwrap();
    AppSettings {
        sync_interval_seconds: cfg.sync_interval_seconds,
        sync_enabled: cfg.sync_enabled,
        autostart_enabled: cfg.autostart_enabled,
        archive_threshold_days: cfg.archive_threshold_days,
    }
}

fn read_meta_file(state: &State<'_, ConfigState>, name: &str) -> Option<String> {
    let path = vault_meta_path(state, name).ok()?;
    fs::read_to_string(&path).ok()
}

fn write_meta_file(
    state: &State<'_, ConfigState>,
    name: &str,
    content: &str,
) -> Result<(), String> {
    let path = vault_meta_path(state, name)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&path, content).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_bookmarks(state: State<'_, ConfigState>) -> Vec<String> {
    if let Some(raw) = read_meta_file(&state, "bookmarks.json") {
        if let Ok(list) = serde_json::from_str::<Vec<String>>(&raw) {
            return list;
        }
    }
    state
        .0
        .lock()
        .unwrap()
        .active_vault()
        .map(|v| v.bookmarks.clone())
        .unwrap_or_default()
}

#[tauri::command]
fn set_bookmarks(
    bookmarks: Vec<String>,
    state: State<'_, ConfigState>,
) -> Result<(), String> {
    let json = serde_json::to_string_pretty(&bookmarks).map_err(|e| e.to_string())?;
    write_meta_file(&state, "bookmarks.json", &json)
}

#[tauri::command]
fn get_session(state: State<'_, ConfigState>) -> Session {
    if let Some(raw) = read_meta_file(&state, "session.json") {
        if let Ok(s) = serde_json::from_str::<Session>(&raw) {
            return s;
        }
    }
    let cfg = state.0.lock().unwrap();
    if let Some(v) = cfg.active_vault() {
        Session {
            open_tabs: v.open_tabs.clone(),
            active_tab_path: v.active_tab_path.clone(),
        }
    } else {
        Session {
            open_tabs: Vec::new(),
            active_tab_path: None,
        }
    }
}

#[tauri::command]
fn set_session(
    open_tabs: Vec<String>,
    active_tab_path: Option<String>,
    state: State<'_, ConfigState>,
) -> Result<(), String> {
    let session = Session {
        open_tabs,
        active_tab_path,
    };
    let json = serde_json::to_string_pretty(&session).map_err(|e| e.to_string())?;
    write_meta_file(&state, "session.json", &json)
}

#[tauri::command]
fn update_settings(
    settings: AppSettings,
    state: State<'_, ConfigState>,
    app: AppHandle,
) -> Result<(), String> {
    {
        let mut cfg = state.0.lock().unwrap();
        cfg.sync_interval_seconds = settings.sync_interval_seconds;
        cfg.sync_enabled = settings.sync_enabled;
        cfg.autostart_enabled = settings.autostart_enabled;
        cfg.archive_threshold_days = settings.archive_threshold_days;
        save_config(&app, &cfg)?;
    }
    let manager = app.autolaunch();
    if settings.autostart_enabled {
        manager.enable().map_err(|e| e.to_string())?;
    } else {
        manager.disable().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn get_default_dir_filter(state: State<'_, ConfigState>) -> Option<DirFilter> {
    if let Some(raw) = read_meta_file(&state, "dir-filter.json") {
        if let Ok(f) = serde_json::from_str::<DirFilter>(&raw) {
            return Some(f);
        }
    }
    state
        .0
        .lock()
        .unwrap()
        .active_vault()
        .and_then(|v| v.default_dir_filter.clone())
}

#[tauri::command]
fn set_default_dir_filter(
    filter: Option<DirFilter>,
    state: State<'_, ConfigState>,
) -> Result<(), String> {
    let path = vault_meta_path(&state, "dir-filter.json")?;
    match filter {
        Some(f) => {
            if let Some(parent) = path.parent() {
                fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            let json = serde_json::to_string_pretty(&f).map_err(|e| e.to_string())?;
            fs::write(&path, json).map_err(|e| e.to_string())
        }
        None => {
            if path.exists() {
                fs::remove_file(&path).map_err(|e| e.to_string())?;
            }
            Ok(())
        }
    }
}

#[tauri::command]
fn quit_app(app: AppHandle) {
    app.exit(0);
}

fn vault_meta_path(state: &State<'_, ConfigState>, name: &str) -> Result<PathBuf, String> {
    let cfg = state.0.lock().unwrap();
    let root = cfg.active_vault_path().ok_or("no active vault")?;
    Ok(root.join(".clawless").join(name))
}

#[tauri::command]
fn read_vault_meta(
    name: String,
    state: State<'_, ConfigState>,
) -> Result<Option<String>, String> {
    let path = vault_meta_path(&state, &name)?;
    match fs::read_to_string(&path) {
        Ok(s) => Ok(Some(s)),
        Err(_) => Ok(None),
    }
}

#[tauri::command]
fn write_vault_meta(
    name: String,
    content: String,
    state: State<'_, ConfigState>,
) -> Result<(), String> {
    let path = vault_meta_path(&state, &name)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&path, content).map_err(|e| e.to_string())
}

#[tauri::command]
fn grep_vault(
    query: String,
    state: State<'_, ConfigState>,
) -> Result<Vec<String>, String> {
    let root = state
        .0
        .lock()
        .unwrap()
        .active_vault_path()
        .ok_or("no active vault")?;
    let q = query.to_lowercase();
    if q.is_empty() {
        return Ok(vec![]);
    }
    let mut out = Vec::new();
    for entry in WalkDir::new(&root)
        .into_iter()
        .filter_entry(|e| e.depth() == 0 || !e.file_name().to_string_lossy().starts_with('.'))
        .filter_map(|e| e.ok())
    {
        if !entry.file_type().is_file() {
            continue;
        }
        let name = entry.file_name().to_string_lossy();
        if !name.ends_with(".md") {
            continue;
        }
        let Ok(content) = fs::read_to_string(entry.path()) else {
            continue;
        };
        if content.to_lowercase().contains(&q) {
            if let Ok(rel) = entry.path().strip_prefix(&root) {
                out.push(rel.to_string_lossy().replace('\\', "/"));
            }
        }
    }
    Ok(out)
}

#[tauri::command]
fn rename_vault_file(
    rel_path: String,
    new_rel_path: String,
    state: State<'_, ConfigState>,
) -> Result<(), String> {
    let from = resolve_active_path(&state, &rel_path)?;
    let to = resolve_active_path(&state, &new_rel_path)?;
    if let Some(parent) = to.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    if to.exists() {
        return Err("destination already exists".into());
    }
    fs::rename(&from, &to).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_vault_file(
    rel_path: String,
    state: State<'_, ConfigState>,
) -> Result<(), String> {
    let path = resolve_active_path(&state, &rel_path)?;
    fs::remove_file(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn set_autostart(enabled: bool, app: AppHandle) -> Result<(), String> {
    let manager = app.autolaunch();
    if enabled {
        manager.enable().map_err(|e| e.to_string())?;
    } else {
        manager.disable().map_err(|e| e.to_string())?;
    }
    let cfg_state: State<ConfigState> = app.state();
    let mut cfg = cfg_state.0.lock().unwrap();
    cfg.autostart_enabled = enabled;
    save_config(&app, &cfg)
}

fn spawn_sync_thread(app: AppHandle, interval: Duration) -> Sender<()> {
    let (tx, rx) = mpsc::channel::<()>();
    thread::spawn(move || loop {
        let path_opt = {
            let state: State<ConfigState> = app.state();
            let cfg = state.0.lock().unwrap();
            cfg.active_vault_path()
        };
        if let Some(p) = path_opt {
            run_sync_and_emit(&app, &p);
        }
        match rx.recv_timeout(interval) {
            Ok(()) | Err(mpsc::RecvTimeoutError::Timeout) => continue,
            Err(mpsc::RecvTimeoutError::Disconnected) => break,
        }
    });
    tx
}

fn is_date_prefixed(name: &str) -> bool {
    let b = name.as_bytes();
    b.len() >= 11
        && b[0..4].iter().all(|c| c.is_ascii_digit())
        && b[4] == b'-'
        && b[5..7].iter().all(|c| c.is_ascii_digit())
        && b[7] == b'-'
        && b[8..10].iter().all(|c| c.is_ascii_digit())
        && b[10] == b'_'
}

fn spawn_rename_watchdog(app: AppHandle, vault: PathBuf) {
    use notify::{EventKind, RecursiveMode, Watcher};
    use std::collections::HashMap;

    thread::spawn(move || {
        let (tx, rx) = mpsc::channel::<notify::Result<notify::Event>>();
        let mut watcher = match notify::recommended_watcher(tx) {
            Ok(w) => w,
            Err(_) => return,
        };
        if watcher.watch(&vault, RecursiveMode::Recursive).is_err() {
            return;
        }

        let mut pending: HashMap<PathBuf, SystemTime> = HashMap::new();
        let stable_after = Duration::from_secs(5);
        let max_wait = Duration::from_secs(15 * 60);

        loop {
            match rx.recv_timeout(Duration::from_secs(10)) {
                Ok(Ok(event)) => {
                    let interesting = matches!(
                        event.kind,
                        EventKind::Create(_) | EventKind::Modify(_)
                    );
                    if !interesting {
                        continue;
                    }
                    for path in event.paths {
                        if path.extension().and_then(|e| e.to_str()) != Some("md") {
                            continue;
                        }
                        if path.components().any(|c| {
                            c.as_os_str()
                                .to_str()
                                .map(|s| s.starts_with('.') || s == "archive")
                                .unwrap_or(false)
                        }) {
                            continue;
                        }
                        let name = path.file_stem().and_then(|s| s.to_str()).unwrap_or("");
                        if is_date_prefixed(name) {
                            continue;
                        }
                        pending.entry(path).or_insert_with(SystemTime::now);
                    }
                }
                Ok(Err(_)) => {}
                Err(mpsc::RecvTimeoutError::Timeout) => {}
                Err(mpsc::RecvTimeoutError::Disconnected) => break,
            }

            let now = SystemTime::now();
            let mut emit_paths: Vec<PathBuf> = Vec::new();
            let mut drop_paths: Vec<PathBuf> = Vec::new();
            for (p, since) in &pending {
                let age = now.duration_since(*since).unwrap_or(Duration::ZERO);
                let size = fs::metadata(p).map(|m| m.len()).unwrap_or(0);
                if age >= stable_after && size > 50 {
                    emit_paths.push(p.clone());
                } else if age > max_wait {
                    drop_paths.push(p.clone());
                }
            }
            for p in &emit_paths {
                pending.remove(p);
                if let Ok(rel) = p.strip_prefix(&vault) {
                    let rel_str = rel.to_string_lossy().replace('\\', "/");
                    let _ = app.emit("vault-rename-candidate", rel_str);
                }
            }
            for p in &drop_paths {
                pending.remove(p);
            }
        }
    });
}

fn show_main_window(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.set_focus();
        let _ = win.unminimize();
    }
}

fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let open_item = MenuItemBuilder::new("Open Clawless").id("open").build(app)?;
    let sync_item = MenuItemBuilder::new("Sync now").id("sync_now").build(app)?;
    let daily_item = MenuItemBuilder::new("New daily log").id("daily").build(app)?;
    let archive_item = MenuItemBuilder::new("Run auto-archive")
        .id("archive")
        .build(app)?;
    let quit_item = MenuItemBuilder::new("Quit").id("quit").build(app)?;
    let menu = MenuBuilder::new(app)
        .items(&[
            &open_item,
            &sync_item,
            &daily_item,
            &archive_item,
            &quit_item,
        ])
        .build()?;

    TrayIconBuilder::with_id("clawless-tray")
        .icon(app.default_window_icon().cloned().unwrap())
        .menu(&menu)
        .tooltip("Clawless")
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => show_main_window(app),
            "sync_now" => {
                let state: State<ConfigState> = app.state();
                let path_opt = {
                    let cfg = state.0.lock().unwrap();
                    cfg.active_vault_path()
                };
                if let Some(vault) = path_opt {
                    let app_clone = app.clone();
                    thread::spawn(move || {
                        run_sync_and_emit(&app_clone, &vault);
                    });
                }
            }
            "daily" => {
                show_main_window(app);
                let _ = app.emit("daily-log-trigger", ());
            }
            "archive" => {
                show_main_window(app);
                let _ = app.emit("archive-trigger", ());
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .build(app)?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec![]),
        ))
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                window.hide().ok();
                api.prevent_close();
            }
        })
        .setup(|app| {
            let cfg = load_config(&app.handle());
            let active_path = cfg.active_vault_path();
            let interval = Duration::from_secs(cfg.sync_interval_seconds);
            let sync_enabled = cfg.sync_enabled;
            let autostart_enabled = cfg.autostart_enabled;

            app.manage(ConfigState(Mutex::new(cfg)));
            app.manage(SyncTrigger(Mutex::new(None)));

            #[cfg(target_os = "windows")]
            if let Some(window) = app.get_webview_window("main") {
                use window_vibrancy::{apply_acrylic, apply_mica};
                if apply_mica(&window, None).is_err() {
                    let _ = apply_acrylic(&window, Some((243, 238, 250, 200)));
                }
            }

            build_tray(app.handle())?;

            if autostart_enabled {
                let _ = app.autolaunch().enable();
            }

            if sync_enabled {
                let tx = spawn_sync_thread(app.handle().clone(), interval);
                let trigger_state: State<SyncTrigger> = app.state();
                *trigger_state.0.lock().unwrap() = Some(tx);
            }
            if let Some(p) = active_path {
                spawn_rename_watchdog(app.handle().clone(), p);
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_vaults,
            get_active_vault,
            add_vault,
            remove_vault,
            update_vault,
            set_active_vault,
            read_file,
            write_file,
            list_vault,
            list_vault_meta,
            rename_vault_file,
            delete_vault_file,
            trigger_sync,
            sync_now,
            set_autostart,
            get_backend_config,
            set_backend_config,
            get_settings,
            update_settings,
            get_bookmarks,
            set_bookmarks,
            get_session,
            set_session,
            get_default_dir_filter,
            set_default_dir_filter,
            grep_vault,
            quit_app,
            read_vault_meta,
            write_vault_meta,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
