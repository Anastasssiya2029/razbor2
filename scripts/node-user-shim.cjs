// Some restricted Windows runners expose no POSIX identity helpers and make
// os.userInfo() fail before tsx can start.  tsx only needs a stable value for
// its temporary-directory name, so provide the conventional Windows fallback.
if (process.platform === "win32" && typeof process.geteuid !== "function") {
  process.geteuid = () => 0;
}
