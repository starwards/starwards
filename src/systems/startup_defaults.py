from .power_levels import PowerLevel
DEFAULT_STARTUP_POWER = PowerLevel.NORMAL
SYSTEM_DEFAULTS = {s:DEFAULT_STARTUP_POWER for s in ["reactor","shields","engines","life_support","sensors","communications","navigation"]}
SYSTEM_DEFAULTS["weapons"] = PowerLevel.LOW
def get_initial_power(name): return SYSTEM_DEFAULTS.get(name.lower(), DEFAULT_STARTUP_POWER)