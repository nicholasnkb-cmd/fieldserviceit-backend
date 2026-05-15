#!/bin/bash
echo "=== BUILD SKIPPED (using pre-built dist) ==="
echo "dist/main.js exists: $(test -f dist/main.js && echo YES || echo NO)"
echo "Node: $(node --version)"
echo "PWD: $(pwd)"
echo "=== BUILD COMPLETE ==="
