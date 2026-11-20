"""Design-token registry, standard presets and theme resolution.

Everything in this package is plain Python with no database access, so it can
be imported by hooks, APIs, install code and unit tests alike. The registry
here is the single source of truth for theme colours: the browser receives the
resolved token values through the boot payload and never hard-codes them.
"""
