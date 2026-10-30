"""Static checks on default/macros.conf."""
import os
import re

MACROS = os.path.join(os.path.dirname(__file__), "..", "..", "default", "macros.conf")


def macro_definition(stanza):
    """First `definition =` line of a stanza (conf continuation lines are not needed here)."""
    text = open(MACROS).read()
    body = re.search(r"^\[%s\]\n(.*?)(?=^\[|\Z)" % re.escape(stanza), text, re.S | re.M).group(1)
    return re.search(r"^definition\s*=\s*(.*)$", body, re.M).group(1)


def test_input_macro_defaults_source_lookup():
    # Lookups that were not written by output_adb_lookup have no source_lookup column;
    # without a default their rows get a null `source`.
    definition = macro_definition("input_adb_lookup(1)")
    assert definition.startswith("inputlookup append=true $lookup$")
    assert 'source_lookup=coalesce(source_lookup, "$lookup$")' in definition
