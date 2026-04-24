#!/usr/bin/env bash
# Apply host-level kernel memory tuning for a dev machine running multiple
# Docker workloads on 8 GB RAM.
#
# Run once per boot:  sudo bash scripts/tune-host-memory.sh
# To make permanent: sudo cp 99-champiq-dev.conf /etc/sysctl.d/
#                    sudo sysctl --system
set -euo pipefail

SYSCTL_CONF=/etc/sysctl.d/99-champiq-dev.conf

cat > "$SYSCTL_CONF" <<'EOF'
# --- ChampIQ dev host tuning ---

# Reduce swappiness: kernel prefers to reclaim file-backed page cache
# rather than swapping anonymous process memory. 10 (not 0) allows swap
# as a last resort — 0 can cause OOM kills instead of graceful eviction.
vm.swappiness = 10

# Increase vfs_cache_pressure slightly below default (100) so the kernel
# keeps directory/inode cache longer. Helps repeated Docker layer reads.
vm.vfs_cache_pressure = 50

# Allow dirty pages to accumulate a bit more before writeback, reducing
# I/O storms on idle writes (Postgres WAL, Redis AOF).
vm.dirty_background_ratio = 5
vm.dirty_ratio = 15
vm.dirty_expire_centisecs = 6000
vm.dirty_writeback_centisecs = 1000

# Overcommit: allow reasonable overcommit (default 0 = heuristic).
# Mode 1 would be too aggressive; keep at 0 but raise the ratio slightly.
vm.overcommit_memory = 0
vm.overcommit_ratio = 60
EOF

sysctl --load "$SYSCTL_CONF"
echo "Kernel memory parameters applied."
echo ""
echo "Current values:"
sysctl vm.swappiness vm.vfs_cache_pressure vm.dirty_background_ratio vm.dirty_ratio
