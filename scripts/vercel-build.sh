#!/usr/bin/env bash
set -e

cp src/environments/environment.template.ts src/environments/environment.ts
cp src/environments/environment.prod.template.ts src/environments/environment.prod.ts
bash scripts/generate-env.sh
npm run build
cp dist/InternLink/browser/index.csr.html dist/InternLink/browser/index.html
