#!/usr/bin/env node
// Run at image-build time only (see ../../../Dockerfile.scan-runner), never
// at runtime: prints the fingerprint of the directory given as argv[2] to
// stdout, which the Dockerfile bakes into the image as /app/.scan-image-hash.
// dockerRunner.js recomputes the same hash from the host's own checkout
// before every scan and refuses to run against the image if they differ -
// see its checkImageFreshness().
import { computeSourceHash } from './imageHash.js';

process.stdout.write(computeSourceHash(process.argv[2]));
