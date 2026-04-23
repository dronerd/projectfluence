# run_update_lessons_with_trace.py
import runpy, sys, traceback, pathlib

print("Launcher running from:", pathlib.Path.cwd())
script = pathlib.Path(__file__).resolve().parent / "update_lessons.py"
print("Target script path:", script)

if not script.exists():
    print("ERROR: update_lessons.py not found at path above.")
    sys.exit(2)

try:
    # run in its own global namespace
    runpy.run_path(str(script), run_name="__main__")
    print("Script completed normally.")
except SystemExit as se:
    print("SystemExit raised by script:", se)
    # print traceback if any
    traceback.print_exc()
except Exception:
    print("Exception thrown when running the script — full traceback below:")
    traceback.print_exc()
    # save to file for copy/paste
    out = pathlib.Path.home() / "update_lessons_trace.txt"
    with out.open("w", encoding="utf-8") as f:
        import traceback as tb
        f.write("Traceback (saved):\n\n")
        tb.print_exc(file=f)
    print("Full traceback saved to:", out)
