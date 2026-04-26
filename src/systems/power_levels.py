from enum import Enum, auto
class PowerLevel(Enum):
    IDLE = auto(); LOW = auto(); NORMAL = auto(); HIGH = auto(); MAXIMUM = auto()
    def to_percent(self):
        {PowerLevel.IDLE:5,PowerLevel.LOW:25,PowerLevel.NORMAL:75,PowerLevel.HIGH:90,PowerLevel.MAXIMUM:100}[self]
POWER_LEVEL_ALIASES = {"Mid":"NORMAL","mid":"normal"}