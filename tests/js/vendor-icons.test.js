'use strict';
// The logo of a source is picked from keywords in its name or lookup name (assets/vendors.json, built into vendor_icons.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
let VI;
new Function('define', fs.readFileSync(path.join(ROOT, 'appserver', 'static', 'js', 'src', 'vendor_icons.js'), 'utf8'))((deps, f) => { VI = f(); });
const idOf = (text) => { const v = VI.vendorFor(text); return v ? v.id : null; };

test('there are 31 vendors with a logo each, and ids are unique', () => {
	assert.equal(VI.VENDORS.length, 31);
	assert.equal(new Set(VI.VENDORS.map((v) => v.id)).size, 31);
	VI.VENDORS.forEach((v) => assert.match(v.light, /^data:image\/(svg\+xml|png)[,;]/, v.id));
});

test('every source template matches its vendor from its lookup name', () => {
	const expected = {
		'ad-computers': 'microsoft', 'defender-machines': 'microsoft', 'crowdstrike-devices': 'crowdstrike', 'tenable-assets': 'tenable', 'servicenow-cmdb': 'servicenow',
		'qualys-vmdr-hosts': 'qualys', 'rapid7-insightvm': 'rapid7', 'armis-devices': 'armis', 'axonius-devices': 'axonius', 'lansweeper-assets': 'lansweeper',
		'jamf-computers': 'jamf', 'aws-ec2-instances': 'aws', 'sentinelone-agents': 'sentinelone', 'tanium-inventory': 'tanium', 'tanium-discover': 'tanium',
		'carbon-black-cloud-devices': 'carbonblack', 'azure-virtual-machines': 'azure', 'entra-devices': 'entra', 'gcp-compute-instances': 'gcp',
		'cortex-xdr-endpoints': 'cortexxdr', 'forescout-hosts': 'forescout', 'meraki-devices': 'meraki', 'wiz-virtual-machines': 'wiz',
		'runzero-assets': 'runzero', 'nozomi-assets': 'nozomi', 'claroty-xdome-devices': 'claroty', 'bigfix-clients': 'bigfix', 'manageengine-endpoint-central': 'manageengine',
		'trellix-epo-systems': 'trellix', 'device42-devices': 'device42', 'workspace-one-devices': 'workspaceone', 'cisco-secure-endpoint-computers': 'ciscose', 'symantec-endpoint-protection': 'symantec',
		'splunk-hosts': null, 'dhcp-cim': null, 'vulnerabilities-cim': null,
	};
	const conf = fs.readFileSync(path.join(ROOT, 'default', 'savedsearches.conf'), 'utf8');
	const seen = new Set();
	for (const m of conf.matchAll(/^\[assetdb-src-([^\]]+)\][\s\S]*?output_adb_lookup\((assetdb_src_[a-z0-9_]+\.csv)\)/gm)) {
		if (!(m[1] in expected)) continue;   // a template added later: covered by the test below
		seen.add(m[1]);
		assert.equal(idOf(m[2]), expected[m[1]], `${m[1]} (${m[2]})`);
	}
	assert.equal(seen.size, Object.keys(expected).length, 'every expected template was found');
});

test('every template names a vendor icon or knowingly uses the default', () => {
	const conf = fs.readFileSync(path.join(ROOT, 'default', 'savedsearches.conf'), 'utf8');
	const generic = new Set(['splunk-hosts', 'dhcp-cim', 'vulnerabilities-cim']);
	for (const m of conf.matchAll(/^\[assetdb-src-([^\]]+)\][\s\S]*?output_adb_lookup\((assetdb_src_[a-z0-9_]+\.csv)\)/gm)) {
		if (!generic.has(m[1])) assert.ok(idOf(m[2]), `${m[1]} (${m[2]}) has no vendor icon: add a keyword to assets/vendors.json`);
	}
});

test('friendly names match as well, whatever the case or punctuation', () => {
	const cases = {
		'CrowdStrike Falcon': 'crowdstrike', 'CrowdStrikeDevices': 'crowdstrike', 'Azure AD devices': 'entra', 'Azure VMs': 'azure', 'Cisco Meraki': 'meraki',
		'Cisco AMP for Endpoints': 'ciscose', 'WorkspaceONE UEM': 'workspaceone', 'ManageEngine Endpoint Central': 'manageengine', 'HCL BigFix': 'bigfix',
		'Trellix ePO': 'trellix', 'McAfee ePO': 'trellix', 'Symantec Endpoint Protection': 'symantec', 'Nozomi Networks': 'nozomi', 'Claroty xDome': 'claroty',
		'Device42': 'device42', 'runZero': 'runzero', 'Google Compute Engine': 'gcp', 'Intune devices': 'microsoft', 'Active Directory computers': 'microsoft',
		'Tenable.io': 'tenable', 'Nessus': 'tenable', 'Rapid 7': 'rapid7', 'AWS': 'aws', 'Wiz': 'wiz', 'Jamf Pro': 'jamf', 'Carbon Black': 'carbonblack',
	};
	for (const [text, id] of Object.entries(cases)) assert.equal(idOf(text), id, text);
});

test('the name and the lookup name are both read, and unrelated names get no vendor', () => {
	assert.equal(idOf('Endpoints assetdb_src_crowdstrike.csv'), 'crowdstrike');   // the name says nothing, the lookup does
	assert.equal(idOf('Falcon assetdb_src_x.csv'), 'crowdstrike');                // the name says it, the lookup does not
	['Splunk hosts', 'DHCP leases', 'Vulnerabilities', 'My lookup', 'wizard', 'adhoc inventory', '', null, undefined].forEach((t) => assert.equal(idOf(t), null, String(t)));
});

test('short keywords match whole words only, long ones inside a word', () => {
	assert.equal(idOf('wiz_hosts'), 'wiz');
	assert.equal(idOf('wizard_hosts'), null);
	assert.equal(idOf('crowdstrikehosts'), 'crowdstrike');
	assert.equal(idOf('ad_computers'), 'microsoft');
	assert.equal(idOf('head_count'), null);
});

test('the more specific product wins: Entra before Azure, Meraki before Cisco', () => {
	assert.equal(idOf('Azure AD'), 'entra');
	assert.equal(idOf('azure_ad_devices'), 'entra');
	assert.equal(idOf('azure_vms'), 'azure');
	assert.equal(idOf('cisco_meraki'), 'meraki');
	assert.equal(idOf('cisco_secure_endpoint'), 'ciscose');
});

test('vendorIcon draws the logo, a chip on dark for logos that need one, and the default glyph for no vendor', () => {
	const cs = VI.vendorIcon(VI.vendorFor('crowdstrike'), 'light', 16), csDark = VI.vendorIcon(VI.vendorFor('crowdstrike'), 'dark', 16);
	assert.match(cs, /^<img class="vicon" src="data:image\/svg\+xml,/);
	assert.notEqual(cs, csDark, 'CrowdStrike has a variant for dark backgrounds');
	const rz = VI.vendorFor('runzero');
	assert.doesNotMatch(VI.vendorIcon(rz, 'light', 16), /background:#e6ebef/);
	assert.match(VI.vendorIcon(rz, 'dark', 16), /background:#e6ebef/);
	const none = VI.vendorIcon(null, 'dark', 16);
	assert.match(none, /vdefault/); assert.match(none, /<svg/);
	assert.match(VI.vendorIcon(VI.vendorFor('tanium'), 'light', 20), /width="20" height="20"/);
});

test('the logo names are safe to put in a page', () => {
	VI.VENDORS.forEach((v) => assert.doesNotMatch(v.name, /[<>"&]/, v.id));
	VI.VENDORS.forEach((v) => { if (v.light.startsWith('data:image/svg')) assert.doesNotMatch(decodeURIComponent(v.light), /<script|onload=|javascript:/i, v.id); });
});
