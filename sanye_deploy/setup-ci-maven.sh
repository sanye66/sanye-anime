#!/usr/bin/env bash
set -euo pipefail

version=3.9.16
archive="apache-maven-${version}-bin.tar.gz"
install_dir="${RUNNER_TEMP:?}/sanye_maven"
mkdir -p "$install_dir"
cd "$install_dir"
downloaded=false
for host in https://dlcdn.apache.org https://archive.apache.org/dist; do
  url="${host}/maven/maven-3/${version}/binaries/${archive}"
  if curl --fail --silent --show-error --location --connect-timeout 15 --max-time 90 --retry 1 "$url" -o "$archive" &&
     curl --fail --silent --show-error --location --connect-timeout 15 --max-time 30 --retry 1 "${url}.sha512" -o checksum; then
    downloaded=true
    break
  fi
done
if [[ "$downloaded" != true ]]; then
  printf '%s\n' 'Unable to download the pinned Maven distribution and checksum' >&2
  exit 1
fi
expected=$(awk '{print $1}' checksum)
[[ "$expected" =~ ^[[:xdigit:]]{128}$ ]]
printf '%s  %s\n' "$expected" "$archive" | sha512sum --check -
tar -xzf "$archive"
printf '%s\n' "$install_dir/apache-maven-${version}/bin" >> "${GITHUB_PATH:?}"
"$install_dir/apache-maven-${version}/bin/mvn" --version
