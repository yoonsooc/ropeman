/**
 * Bytes of one explore snapshot. The largest gallery repo (airflow) builds about 10 MB, and a KV
 * value holds at most 25 MiB. `exploreSnapshotBuilder.MAX_SNAPSHOT_BYTES` is the same number.
 * It lives outside explore.ts because a Worker's main module may export only handlers; a change
 * here still redeploys the explore worker (`scripts/changed-workers.mjs` matches `explore.*.ts`).
 */
export const MAX_BODY_SIZE = 16 * 1024 * 1024;
