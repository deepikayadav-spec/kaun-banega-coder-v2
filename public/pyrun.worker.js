/* Runs students' Python with Pyodide (real CPython in WebAssembly), off the main thread.
   The page stops this worker when a program runs too long. input() reads from the given lines. */
importScripts("https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js");
const RUNNER = `
import sys, io, traceback
def __kbc_run(code, stdin):
    out = io.StringIO()
    lines = list(stdin)
    def _input(prompt=""):
        out.write(str(prompt))
        if not lines:
            raise EOFError("EOF when reading a line")
        return str(lines.pop(0))
    g = {"__name__": "__main__", "input": _input}
    old = sys.stdout
    sys.stdout = out
    err = ""
    try:
        exec(compile(code, "<your code>", "exec"), g)
    except SystemExit:
        pass
    except BaseException as e:
        err = "".join(traceback.format_exception_only(type(e), e)).strip()
    finally:
        sys.stdout = old
    return [out.getvalue(), err]
`;
let py = loadPyodide().then((p) => { p.runPython(RUNNER); postMessage({ ready: true }); return p; })
  .catch((e) => { postMessage({ fail: String(e && e.message || e) }); throw e; });
onmessage = async (e) => {
  const { id, code, stdin } = e.data;
  try {
    const p = await py;
    const run = p.globals.get("__kbc_run");
    const res = run(code, p.toPy(stdin || []));
    const [stdout, error] = res.toJs();
    res.destroy(); run.destroy();
    postMessage({ id, stdout, error });
  } catch (err) {
    postMessage({ id, stdout: "", error: String(err && err.message || err) });
  }
};
