#!/usr/bin/env bash

set -eux

pnpm esbuild src/*.ts --bundle --platform=browser --outdir=dist