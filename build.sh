#!/usr/bin/env bash

set -eux

pnpm esbuild src/dcard.ts --bundle --platform=browser --outdir=dist