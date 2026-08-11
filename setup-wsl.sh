#!/usr/bin/env bash

set -Eeuo pipefail

readonly TASK_DOCKER_PACKAGES=(
  docker-ce
  docker-ce-cli
  containerd.io
  docker-buildx-plugin
  docker-compose-plugin
)
readonly TASK_CONFLICTING_PACKAGES=(
  docker.io
  docker-compose
  docker-compose-v2
  docker-doc
  podman-docker
  containerd
  runc
)

log() {
  printf '[setup-wsl] %s\n' "$*"
}

fail() {
  printf '[setup-wsl] ERROR: %s\n' "$*" >&2
  exit 1
}

on_error() {
  local exit_code=$?
  printf '[setup-wsl] ERROR: setup failed at line %s (exit %s).\n' \
    "${BASH_LINENO[0]}" "$exit_code" >&2
  exit "$exit_code"
}

trap on_error ERR

if [[ ! -r /proc/sys/kernel/osrelease ]] ||
  ! grep -Eqi '(microsoft-standard|wsl2)' /proc/sys/kernel/osrelease; then
  fail 'This script must be run from a WSL2 distribution.'
fi

# shellcheck disable=SC1091
source /etc/os-release
if [[ "${ID:-}" != 'ubuntu' ]]; then
  fail 'This automatic installer supports Ubuntu on WSL2 only.'
fi

if [[ "$(ps -p 1 -o comm=)" != 'systemd' ]]; then
  fail 'systemd is not enabled. Add "[boot]\nsystemd=true" to /etc/wsl.conf, run "wsl --shutdown" in PowerShell, and try again.'
fi

if ! command -v sudo >/dev/null 2>&1; then
  fail 'sudo was not found. Install sudo or ask an administrator to run the setup.'
fi

if [[ "$(id -u)" -eq 0 ]]; then
  fail 'Run this script as your normal user, not as root or with "sudo ./setup-wsl.sh".'
fi
readonly TASK_RUN_USER="$(id -un)"

log 'Administrator permission is required to install and start Docker Engine.'
sudo -v

installed_conflicts=()
for package_name in "${TASK_CONFLICTING_PACKAGES[@]}"; do
  if dpkg-query -W -f='${db:Status-Abbrev}' "$package_name" 2>/dev/null |
    grep -q '^ii '; then
    installed_conflicts+=("$package_name")
  fi
done

if ((${#installed_conflicts[@]} > 0)); then
  printf '[setup-wsl] Conflicting packages were found: %s\n' \
    "${installed_conflicts[*]}"
  printf '[setup-wsl] Docker requires these packages to be removed before continuing.\n'
  printf '[setup-wsl] Existing Docker data under /var/lib/docker is not deleted.\n'

  if [[ ! -t 0 ]]; then
    fail 'Run this script in an interactive terminal to approve removal of conflicting packages.'
  fi

  read -r -p '[setup-wsl] Remove the conflicting packages and continue? [y/N] ' answer
  if [[ ! "$answer" =~ ^[Yy]$ ]]; then
    fail 'Setup was cancelled without removing any packages.'
  fi

  sudo apt-get remove -y "${installed_conflicts[@]}"
fi

log "Registering Docker's official apt repository..."
sudo apt-get update
sudo apt-get install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

readonly TASK_DOCKER_ARCHITECTURE="$(dpkg --print-architecture)"
readonly TASK_DOCKER_CODENAME="${UBUNTU_CODENAME:-${VERSION_CODENAME:-}}"
[[ -n "$TASK_DOCKER_CODENAME" ]] ||
  fail 'The Ubuntu codename could not be detected from /etc/os-release.'

printf '%s\n' \
  'Types: deb' \
  'URIs: https://download.docker.com/linux/ubuntu' \
  "Suites: $TASK_DOCKER_CODENAME" \
  'Components: stable' \
  "Architectures: $TASK_DOCKER_ARCHITECTURE" \
  'Signed-By: /etc/apt/keyrings/docker.asc' |
  sudo tee /etc/apt/sources.list.d/docker.sources >/dev/null

sudo apt-get update

missing_docker_packages=()
for package_name in "${TASK_DOCKER_PACKAGES[@]}"; do
  if ! dpkg-query -W -f='${db:Status-Abbrev}' "$package_name" 2>/dev/null |
    grep -q '^ii '; then
    missing_docker_packages+=("$package_name")
  fi
done

if ((${#missing_docker_packages[@]} > 0)); then
  log 'Installing Docker Engine, Buildx, and Docker Compose...'
  sudo apt-get install -y "${missing_docker_packages[@]}"
else
  log 'Docker Engine, Buildx, and Docker Compose are already installed.'
fi

log 'Enabling and starting Docker Engine...'
sudo systemctl enable --now docker

if ! getent group docker >/dev/null; then
  fail 'The docker group was not created during installation.'
fi

if ! id -nG "$TASK_RUN_USER" | tr ' ' '\n' | grep -qx docker; then
  log "Adding $TASK_RUN_USER to the docker group..."
  sudo usermod -aG docker "$TASK_RUN_USER"
fi

log 'Verifying Docker Engine...'
sudo docker info >/dev/null
sudo docker compose version

log 'Setup completed successfully.'
log 'Close all Ubuntu terminals and reopen Ubuntu before running docker without sudo.'
log 'Run "./dev up" from the repository to start the application.'
