#!/usr/bin/env bash
set -euo pipefail

version=3.9.16
archive="apache-maven-${version}-bin.tar.gz"
url="https://archive.apache.org/dist/maven/maven-3/${version}/binaries/${archive}"
install_dir="${RUNNER_TEMP:?}/sanye_maven"
mkdir -p "$install_dir"
cd "$install_dir"
curl --fail --silent --show-error --location --retry 3 "$url" -o "$archive"
curl --fail --silent --show-error --location --retry 3 "${url}.sha512" -o checksum
expected=$(awk '{print $1}' checksum)
[[ "$expected" =~ ^[[:xdigit:]]{128}$ ]]
printf '%s  %s\n' "$expected" "$archive" | sha512sum --check -
tar -xzf "$archive"
printf '%s\n' "$install_dir/apache-maven-${version}/bin" >> "${GITHUB_PATH:?}"
"$install_dir/apache-maven-${version}/bin/mvn" --version
