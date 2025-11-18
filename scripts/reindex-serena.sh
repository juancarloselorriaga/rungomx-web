#!/usr/bin/env bash

echo "🧹 Clearing Serena caches…"
rm -rf .serena

echo "🔄 Rebuilding index…"
uvx --from git+https://github.com/oraios/serena serena project index

echo "✨ Serena memory rebuilt fresh!"
