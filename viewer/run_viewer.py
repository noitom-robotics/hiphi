#!/usr/bin/env python3
"""Convenience entry point: ``python run_viewer.py <path>``.

Equivalent to ``python -m hiphi_motion_viewer <path>``, for users who would
rather run a script than a module.
"""

from hiphi_motion_viewer.__main__ import main

if __name__ == "__main__":
    raise SystemExit(main())
