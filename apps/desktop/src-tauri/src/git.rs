use std::path::Path;
use std::process::{Command, Output, Stdio};

use serde::Serialize;

#[cfg(windows)]
use std::os::windows::process::CommandExt;
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

#[derive(Clone, Serialize, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum SyncState {
    Idle,
    Syncing,
    Conflict,
    Error,
    Disconnected,
}

#[derive(Clone, Serialize, Debug)]
pub struct SyncReport {
    pub state: SyncState,
    pub message: Option<String>,
    pub conflict_files: Vec<String>,
}

fn now_utc_string() -> String {
    use time::OffsetDateTime;
    let n = OffsetDateTime::now_utc();
    format!(
        "{:04}-{:02}-{:02} {:02}:{:02}:{:02}Z",
        n.year(),
        u8::from(n.month()),
        n.day(),
        n.hour(),
        n.minute(),
        n.second()
    )
}

fn git(repo: &Path, args: &[&str]) -> Result<Output, String> {
    let mut cmd = Command::new("git");
    cmd.current_dir(repo)
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);
    cmd.output().map_err(|e| e.to_string())
}

fn run_git(repo: &Path, args: &[&str]) -> Result<String, String> {
    let out = git(repo, args)?;
    if !out.status.success() {
        return Err(String::from_utf8_lossy(&out.stderr).trim().to_string());
    }
    Ok(String::from_utf8_lossy(&out.stdout).to_string())
}

fn is_repo(repo: &Path) -> bool {
    git(repo, &["rev-parse", "--is-inside-work-tree"])
        .map(|o| o.status.success())
        .unwrap_or(false)
}

fn has_remote(repo: &Path) -> bool {
    git(repo, &["remote", "get-url", "origin"])
        .map(|o| o.status.success())
        .unwrap_or(false)
}

fn current_branch(repo: &Path) -> Result<String, String> {
    let out = run_git(repo, &["rev-parse", "--abbrev-ref", "HEAD"])?;
    Ok(out.trim().to_string())
}

fn list_conflicts(repo: &Path) -> Vec<String> {
    let Ok(out) = run_git(repo, &["diff", "--name-only", "--diff-filter=U"]) else {
        return vec![];
    };
    out.lines()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect()
}

fn has_uncommitted(repo: &Path) -> Result<bool, String> {
    let out = run_git(repo, &["status", "--porcelain"])?;
    Ok(!out.trim().is_empty())
}

pub fn pull(repo: &Path) -> Result<SyncReport, String> {
    if !is_repo(repo) {
        return Ok(SyncReport {
            state: SyncState::Disconnected,
            message: Some("not a git repo".into()),
            conflict_files: vec![],
        });
    }
    if !has_remote(repo) {
        return Ok(SyncReport {
            state: SyncState::Disconnected,
            message: Some("no origin remote".into()),
            conflict_files: vec![],
        });
    }

    let conflicts = list_conflicts(repo);
    if !conflicts.is_empty() {
        return Ok(SyncReport {
            state: SyncState::Conflict,
            message: Some(format!("{} conflict file(s) pending", conflicts.len())),
            conflict_files: conflicts,
        });
    }

    let branch = current_branch(repo)?;
    let out = git(
        repo,
        &["pull", "--no-rebase", "--no-edit", "origin", &branch],
    )?;
    if out.status.success() {
        return Ok(SyncReport {
            state: SyncState::Idle,
            message: Some("pulled".into()),
            conflict_files: vec![],
        });
    }

    let conflicts = list_conflicts(repo);
    if !conflicts.is_empty() {
        return Ok(SyncReport {
            state: SyncState::Conflict,
            message: Some(format!("{} conflict file(s)", conflicts.len())),
            conflict_files: conflicts,
        });
    }

    Err(String::from_utf8_lossy(&out.stderr).trim().to_string())
}

pub fn commit_and_push(repo: &Path) -> Result<SyncReport, String> {
    if !is_repo(repo) {
        return Ok(SyncReport {
            state: SyncState::Disconnected,
            message: Some("not a git repo".into()),
            conflict_files: vec![],
        });
    }

    let conflicts = list_conflicts(repo);
    if !conflicts.is_empty() {
        return Ok(SyncReport {
            state: SyncState::Conflict,
            message: Some(format!(
                "{} conflict file(s) — resolve before sync",
                conflicts.len()
            )),
            conflict_files: conflicts,
        });
    }

    if has_uncommitted(repo)? {
        run_git(repo, &["add", "-A"])?;
        let msg = format!("clawless: auto-sync {}", now_utc_string());
        run_git(repo, &["commit", "-m", &msg])?;
    }

    if !has_remote(repo) {
        return Ok(SyncReport {
            state: SyncState::Disconnected,
            message: Some("committed locally (no remote)".into()),
            conflict_files: vec![],
        });
    }

    let branch = current_branch(repo)?;
    let out = git(repo, &["push", "origin", &branch])?;
    if out.status.success() {
        return Ok(SyncReport {
            state: SyncState::Idle,
            message: Some("synced".into()),
            conflict_files: vec![],
        });
    }
    Err(String::from_utf8_lossy(&out.stderr).trim().to_string())
}

pub fn full_sync(repo: &Path) -> Result<SyncReport, String> {
    let pull_result = pull(repo)?;
    if pull_result.state == SyncState::Conflict || pull_result.state == SyncState::Disconnected {
        return Ok(pull_result);
    }
    commit_and_push(repo)
}
