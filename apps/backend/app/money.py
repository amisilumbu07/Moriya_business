"""Tithe/offering maths. Money is whole ngwee (1/100 kwacha), so everything here is integer arithmetic."""


def percent_of(total: int, percent: int) -> int:
    """`percent`% of `total`, rounded half up to the nearest ngwee (10% of 1005 ngwee = K10.05 -> 101 ngwee)."""
    return (total * percent + 50) // 100


def weekly_split(total: int, tithe_percent: int, offering_percent: int) -> tuple[int, int, int]:
    """Return (tithe, offering, remaining). Remaining is what is left after both are set aside."""
    tithe = percent_of(total, tithe_percent)
    offering = percent_of(total, offering_percent)
    return tithe, offering, total - tithe - offering
