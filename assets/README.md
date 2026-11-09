# Vendor logos

The logos next to each source (the Configure page, the Explorer and the Coverage page). Nothing here is shipped: `scripts/build-vendor-icons.py`
reads `vendors.json` and `vendors/` and writes the code that is (`viz/shared/vendor-icons.mjs` and `appserver/static/js/src/vendor_icons.js`).

A logo is **picked automatically**: the keywords of each vendor in `vendors.json` are looked for in the source name and in its lookup name,
and the first vendor (in file order, so put the more specific product first) that matches wins. A source that matches nothing gets a
neutral default icon. There is no setting to choose a logo.

- Keywords of six or more letters match inside a word (`crowdstrikehosts`), shorter ones only as a whole word (`wiz` does not match `wizard`).
- `<name>.dark.svg` next to a logo is used on the dark theme. `"chip": true` puts a logo that is dark or has a white background on a light chip there.
- To add a vendor: put its logo in `vendors/` (SVG preferred, or a PNG of 64 px; each file under 24 KB), add it to `vendors.json`, run
  `python3 scripts/build-vendor-icons.py`, then `npm run build` and `npm run build:viz`. `make test` fails if the generated files are stale.

## Where the logos come from

| Source | Used for |
|---|---|
| [Brandfetch](https://brandfetch.com) Brand API (symbol, else the parent company's symbol) | CrowdStrike, Tenable, Qualys, Rapid7, Wiz, Nozomi, Jamf, ManageEngine, Axonius, Claroty, Cisco Secure Endpoint, AWS, Microsoft, and the Broadcom symbol for Symantec and Carbon Black, the Palo Alto symbol for Cortex XDR |
| The vendor's own site favicon | SentinelOne, Trellix, ServiceNow, Tanium, Forescout, Lansweeper, runZero, Armis, Device42, Workspace ONE (Omnissa) |
| [Dashboard Icons](https://github.com/homarr-labs/dashboard-icons) | HCL BigFix, Cisco Meraki, Microsoft Entra ID, Microsoft Azure, Google Cloud |

The logos and names are trademarks of their owners and appear only to identify the product a source comes from. The app does not claim
any affiliation. Check each owner's brand guidelines before using the app outside your own organization.
