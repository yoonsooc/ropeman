#!/usr/bin/env bash
source ./lib.sh

build() {
  log "building"
}

deploy() {
  build
  ./notify.sh
}

deploy
