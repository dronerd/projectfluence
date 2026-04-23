# run_decapitalize_with_trace.py
import runpy
import sys
import traceback
import pathlib

print("Launcher running from:", pathlib.Path.cwd())
script = pathlib.Path(__file__).resolve().parent / "decapitalize_words.py"
print("Target script path:", script)

if not script.exists():
    print("ERROR: decapitalize_words.py not found at path above.")
    sys.exit(2)

# forward CLI args to the launched script by setting sys.argv
orig_argv = sys.argv[:]  # keep a copy for diagnostic printing if needed
sys.argv = [str(script)] + orig_argv[1:]

try:
    # run in its own global namespace (as if __main__)
    runpy.run_path(str(script), run_name="__main__")
    print("Script completed normally.")
except SystemExit as se:
    print("SystemExit raised by script:", se)
    # show traceback info if any
    traceback.print_exc()
except Exception:
    print("Exception thrown when running the script — full traceback below:")
    traceback.print_exc()
    # save to file for copy/paste
    out = pathlib.Path.home() / "decapitalize_words_trace.txt"
    with out.open("w", encoding="utf-8") as f:
        f.write("Traceback (saved):\n\n")
        traceback.print_exc(file=f)
    print("Full traceback saved to:", out)
finally:
    # restore argv (not strictly needed, but keeps environment clean for REPL)
    sys.argv = orig_argv
