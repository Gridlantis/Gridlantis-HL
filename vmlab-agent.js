// Metis VM Lab agent — entry point for a second machine that only hosts VMs.
//
//   node vmlab-agent.js
//
// It serves the VM Lab API for this machine and nothing else; a Metis
// elsewhere adds it under VM Lab → Hosts and drives it over a bearer token.
// See tools/vmlab/README.md ("A second VM host").
process.env.METIS_ROLE = "vmlab-agent";
require("./src/vmlab-agent");
