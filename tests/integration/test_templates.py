"""The source-lookup templates on a real Splunk: they parse, and the add-on free one produces a usable source lookup."""
import json
import re

import pytest

from conftest import APP

BUILT_IN = ["assetdb-src-splunk-hosts", "assetdb-src-dhcp-cim", "assetdb-src-vulnerabilities-cim", "assetdb-src-ad-computers", "assetdb-src-defender-machines"]
VENDOR = ["crowdstrike-devices", "tenable-assets", "servicenow-cmdb", "qualys-vmdr-hosts", "rapid7-insightvm", "armis-devices", "axonius-devices",
          "lansweeper-assets", "jamf-computers", "aws-ec2-instances", "sentinelone-agents", "tanium-inventory", "tanium-discover",
          "carbon-black-cloud-devices", "azure-virtual-machines", "entra-devices", "gcp-compute-instances", "cortex-xdr-endpoints",
          "forescout-hosts", "meraki-devices", "wiz-virtual-machines",
          "runzero-assets", "nozomi-assets", "claroty-xdome-devices", "bigfix-clients", "manageengine-endpoint-central", "trellix-epo-systems",
          "device42-devices", "workspace-one-devices", "cisco-secure-endpoint-computers", "symantec-endpoint-protection"]
NAMES = BUILT_IN + ["assetdb-src-" + v for v in VENDOR]


def saved_search(splunk, name):
    r = splunk.get("/servicesNS/nobody/%s/saved/searches/%s" % (APP, name))
    assert r.status_code == 200, (name, r.status_code)
    return r.json()["entry"][0]["content"]


def test_templates_are_shipped_disabled(splunk):
    for name in NAMES:
        content = saved_search(splunk, name)
        assert str(content["disabled"]) in ("1", "True", "true"), name
        assert str(content["is_scheduled"]) in ("0", "False", "false"), name


@pytest.mark.parametrize("name", [n for n in NAMES if n != "assetdb-src-ad-computers"])
def test_template_searches_parse(splunk, name):
    # the AD template needs the ldapsearch command of an add-on, so only the others can be parsed here
    spl = saved_search(splunk, name)["search"]
    r = splunk.post("/services/search/v2/parser", {"q": spl if spl.lstrip().startswith("|") else "search " + spl})
    # a template parses as far as what only an add-on provides: the CIM data model, the add-on's own macro or its eventtype
    missing_addon = ("Data model" in r.text and "was not found" in r.text) or "specifies a macro" in r.text
    assert r.status_code == 200 or missing_addon, (name, r.text[:300])


@pytest.mark.parametrize("name", ["assetdb-src-" + v for v in VENDOR])
def test_vendor_template_parses_with_its_data_source_replaced(splunk, name):
    # the part after the data source (the add-on's macro or eventtype) is plain SPL and must parse on its own, with the app's macros
    spl = saved_search(splunk, name)["search"]
    base, rest = spl.split(" | ", 1)
    r = splunk.post("/services/search/v2/parser", {"q": "search index=_internal | " + rest})
    assert r.status_code == 200, (name, r.text[:400])


def test_the_hosts_template_builds_a_source_lookup_with_host_names(splunk, run_id):
    spl = saved_search(splunk, "assetdb-src-splunk-hosts")["search"]
    lookup = "adbtest_%s_hosts.csv" % run_id
    spl = spl.replace("assetdb_src_splunk_hosts.csv", lookup)
    try:
        splunk.search_job(spl)      # a job, not an export: the lookup file is complete when the job is done
        rows = splunk.search("| inputlookup %s | head 5" % lookup)
        assert rows and all(r.get("nt_host") for r in rows), rows
        assert all(r.get("source_lookup") == lookup for r in rows), "output_adb_lookup adds the source_lookup column"
    finally:
        splunk.delete("/servicesNS/nobody/%s/data/lookup-table-files/%s" % (APP, lookup))


# --- the add-on based templates run against events shaped like the add-ons' own events ---------------------------------
# The add-ons are not installed here. The events below are built from what the add-ons themselves show (their props.conf aliases, lookups and
# input code: the field names that the template reads) and from the vendor's API schema where the add-on only passes the record through. They
# are fed to the template through its own search text with only the data source (everything before the first pipe: an index, a sourcetype, an
# add-on macro or eventtype) replaced. That proves the field handling, not that your add-on indexes exactly these names: a template says so
# in its description when the names come from the vendor's API and not from the add-on.
SAMPLES = {
    "crowdstrike-devices": ("cs_device_id", [
        {"falcon_device": {"device_id": "c1", "hostname": "WIN10-001", "local_ip": "10.3.3.3", "external_ip": "203.0.113.9", "mac_address": "aa-bb-cc-dd-ee-20",
                           "platform_name": "Windows", "os_version": "Windows 10", "machine_domain": "corp.example.com"}, "ta_data": {"Timestamp_value": "2024-05-01T10:00:00.000000Z"}},
        {"falcon_device": {"device_id": "c2", "hostname": "mac-02.corp.example.com", "local_ip": "10.3.3.4", "platform_name": "Mac", "os_version": "Sonoma"}},
    ]),
    "tenable-assets": ("tenable_id", [
        {"id": "t1", "fqdns": ["web01.corp.example.com"], "hostnames": ["WEB01"], "ipv4s": ["10.2.2.2"], "mac_addresses": ["aa:bb:cc:dd:ee:10"], "operating_systems": ["Ubuntu 22.04"],
         "last_seen": "2024-05-01T10:00:00.000Z"},
        {"id": "t2", "network_interfaces": [{"fqdns": ["db01.corp.example.com"], "ipv4s": ["10.2.2.3"], "mac_addresses": ["aa:bb:cc:dd:ee:11"]}],
         "hostnames": ["db01", "10.2.2.3"], "operating_systems": ["Windows Server 2019"]},
        {"id": "t3", "terminated_at": "2024-01-01T00:00:00Z", "ipv4s": ["10.2.2.9"]},
    ]),
    "servicenow-cmdb": ("snow_sys_id", [
        {"sys_id": "s1", "name": "srv01", "host_name": "SRV01", "fqdn": "srv01.corp.example.com", "ip_address": "10.4.4.4", "mac_address": "AA:BB:CC:00:00:01",
         "os_version": "Windows Server 2019", "assigned_to_name": "Ann Lee", "sys_class_name": "cmdb_ci_win_server", "install_status": "1", "sys_updated_on": "2024-05-01 10:00:00"},
        {"sys_id": "s2", "name": "vm01", "fully_qualified_domain_name": "vm01.corp.example.com", "ip_address": "10.4.4.5", "install_status": "7"},
        {"sys_id": "s3", "name": "vm02", "dns_domain": "corp.example.com", "ip_address": "10.4.4.6"},
    ]),
    "qualys-vmdr-hosts": ("ip", [
        {"IP": "10.5.5.5", "DNS": "app01.corp.example.com", "NETBIOS": "APP01", "OS": "Windows Server 2016", "QID": "1"},
        {"IP": "10.5.5.5", "DNS": "app01.corp.example.com", "NETBIOS": "APP01", "OS": "Windows Server 2016", "QID": "2"},
        {"IP": "10.5.5.6", "OS": "Linux"},
    ]),
    "rapid7-insightvm": ("insightvm_id", [
        {"id": "r1", "ip": "10.6.6.6", "mac": "AA:BB:CC:DD:EE:30", "host_name": "db02.corp.example.com", "os_system_name": "Microsoft Windows", "os_version": "2019",
         "last_scan_end": "2024-05-01T10:00:00.000Z"},
        {"id": "r2", "ip": "10.6.6.7", "host_name": "10.6.6.7"},
    ]),
    "armis-devices": ("armis_id", [
        {"id": 1, "name": "PRINTER-01", "ipAddress": "10.7.7.7,10.7.7.8", "ipv6": "fe80::1", "macAddress": "aa:bb:cc:dd:ee:40", "operatingSystem": "Linux", "operatingSystemVersion": "5.4",
         "type": "Printers"},
        {"id": 2, "name": "Apple iPhone", "macAddress": "aa:bb:cc:dd:ee:41"},
    ]),
    "axonius-devices": ("axonius_id", [
        {"internal_axon_id": "ax1", "specific_data.data.hostname": "host01.corp.example.com", "specific_data.data.network_interfaces.ips": ["10.8.8.8"],
         "specific_data.data.network_interfaces.mac": ["AA:BB:CC:DD:EE:50"], "specific_data.data.os.distribution": "Windows 10"},
        {"internal_axon_id": "ax2", "hostname": "host02", "network_interfaces.ips": ["10.8.8.9"], "os.type": "Linux"},
    ]),
    "lansweeper-assets": ("lansweeper_id", [
        {"AssetID": "l1", "AssetName": "PC-01", "FQDN": "pc-01.corp.example.com", "IPAddress": "10.9.9.9", "Mac": "AA:BB:CC:DD:EE:60", "OS": "Windows 11", "AssetTypename": "Windows"},
    ]),
    "jamf-computers": ("jamf_id", [
        {"computerGeneral": {"name": "MBP-01", "lastIpAddress": "203.0.113.5", "lastReportedIp": "10.10.10.10", "reportDate": "2024-05-01T10:00:00.000Z"}, "computer_meta": {"id": "j1"}},
        {"computerHardware": {"macAddress": "AA:BB:CC:DD:EE:70", "altMacAddress": "AA:BB:CC:DD:EE:71", "serialNumber": "C02X"}, "computer_meta": {"id": "j1"}},
        {"computerOS": {"name": "macOS", "version": "14.4"}, "computer_meta": {"id": "j1"}},
    ]),
    "aws-ec2-instances": ("aws_instance_id", [
        {"id": "i-0abc", "private_ip_address": "10.11.11.11", "ip_address": "198.51.100.7", "private_dns_name": "ip-10-11-11-11.ec2.internal", "tags": {"Name": "web-01"}, "platform": "windows", "state": "running"},
        {"id": "i-0def", "private_ip_address": "10.11.11.12", "private_dns_name": "ip-10-11-11-12.ec2.internal", "state": "running"},
        {"id": "i-0ghi", "private_ip_address": "10.11.11.13", "state": "terminated"},
    ]),
    "sentinelone-agents": ("s1_agent_id", [
        {"id": "a1", "computerName": "LT-01", "domain": "corp.example.com", "osName": "Windows 10 Pro", "osRevision": "19045", "machineType": "laptop", "externalIp": "203.0.113.20",
         "networkInterfaces": [{"inet": ["10.12.12.12"], "physical": "AA:BB:CC:DD:EE:80"}, {"inet": ["fe80::1"], "physical": "AA:BB:CC:DD:EE:81"}], "isDecommissioned": False},
        {"id": "a2", "computerName": "OLD-1", "isDecommissioned": True},
    ]),
    "tanium-inventory": ("mac", [
        {"dest": "WS-02.corp.example.com", "IP_Address": "10.13.13.13", "MAC_Address": "AA:BB:CC:DD:EE:90", "Operating_System": "Windows 10", "Computer_Serial_Number": "SN1"},
    ]),
    "tanium-discover": ("mac", [
        {"HostName": "cam-1", "IpAddress": "10.14.14.14", "MacAddress": "AA:BB:CC:DD:EE:91", "Os": "Linux"},
        {"HostName": "noMac", "IpAddress": "10.14.14.15"},
    ]),
    "carbon-black-cloud-devices": ("cbc_device_id", [
        {"id": "d1", "name": "DESKTOP-1", "last_internal_ip_address": "10.15.15.15", "mac_address": "AABBCCDDEE92", "os": "WINDOWS", "os_version": "Windows 10 x64", "status": "REGISTERED"},
        {"id": "d2", "name": "GONE-1", "status": "DEREGISTERED"},
    ]),
    "azure-virtual-machines": ("azure_vm_id", [
        {"sourcetype": "mscs:resource:virtualMachine", "id": "/subscriptions/s/resourceGroups/rg/providers/Microsoft.Compute/virtualMachines/vm1", "name": "vm1",
         "properties": {"vmId": "guid-1", "osProfile": {"computerName": "VM1"}, "storageProfile": {"osDisk": {"osType": "Windows"}}}},
        {"sourcetype": "mscs:resource:networkInterfaceCard", "properties": {"virtualMachine": {"id": "/subscriptions/S/resourceGroups/RG/providers/Microsoft.Compute/virtualMachines/VM1"},
         "macAddress": "00-0D-3A-11-22-33", "ipConfigurations": [{"properties": {"privateIPAddress": "10.16.16.16"}}]}},
        {"sourcetype": "mscs:resource:networkInterfaceCard", "properties": {"macAddress": "00-0D-3A-11-22-44"}},
    ]),
    "entra-devices": ("entra_device_id", [
        {"deviceId": "e1", "displayName": "LAPTOP-9", "operatingSystem": "Windows", "operatingSystemVersion": "10.0.19045", "accountEnabled": True, "approximateLastSignInDateTime": "2024-05-01T10:00:00Z"},
        {"deviceId": "e2", "displayName": "OFF-1", "accountEnabled": False},
    ]),
    "gcp-compute-instances": ("gcp_instance", [
        {"instance_name": "projects/p1/zones/europe-west1-b/instances/gce-01", "network_ip": "10.17.17.17", "nat_ip": "203.0.113.30"},
    ]),
    "cortex-xdr-endpoints": ("xdr_endpoint_id", [
        {"endpoint_id": "x1", "endpoint_name": "WS-7", "ip": ["10.18.18.18"], "os_type": "AGENT_OS_WINDOWS", "os_version": "10.0.1", "domain": "corp.example.com",
         "endpoint_status": "CONNECTED", "last_seen": 1714557600000},
        {"endpoint_id": "x2", "endpoint_name": "GONE-2", "endpoint_status": "UNINSTALLED"},
    ]),
    "forescout-hosts": ("ip", [
        {"ctupdate": "hostinfo", "ip": "10.19.19.19", "mac": "aabbccddee95", "hostname": "printer1", "va_netfunc": "Printer"},
        {"ctupdate": "hostinfo", "ip": "10.19.19.20", "va_netfunc": "Linux Desktop/Server"},
    ]),
    "meraki-devices": ("meraki_serial", [
        {"serial": "Q2XX-1", "name": "AP-Lobby", "lanIp": "10.20.20.20", "mac": "e0:cb:bc:00:00:01", "productType": "wireless"},
        {"serial": "Q2XX-2", "name": "Front door camera", "mac": "e0:cb:bc:00:00:02", "productType": "camera"},
    ]),
    "wiz-virtual-machines": ("wiz_vm_id", [
        {"InstanceId": "i-1", "PrivateIpAddress": "10.21.21.21", "PrivateDnsName": "ip-10-21-21-21.ec2.internal", "NetworkInterfaces": [{"MacAddress": "0a:1b:2c:3d:4e:5f", "PrivateIpAddress": "10.21.21.21"}],
         "lastSeen": "2024-05-01T10:00:00.000Z"},
    ]),
    "runzero-assets": ("runzero_id", [
        {"id": "r1", "names": ["WS-01.corp.example.com", "10.0.0.5"], "addresses": ["10.0.0.5", "203.0.113.8", "fe80::1"], "macs": ["AA:BB:CC:00:11:22"],
         "os_product": "Windows 10", "os_version": "10.0.19045", "type": "Desktop"},
        {"id": "r2", "names": ["10.9.9.9"], "addresses": ["192.168.1.9"]},
    ]),
    "nozomi-assets": ("nozomi_id", [
        {"id": "n1", "label": "PLC-01", "ip": ["10.1.1.1"], "mac_address": ["aa:bb:cc:00:00:01"], "os_or_firmware": "FW 1.2", "type": "plc"},
        {"id": "n2", "label": "Siemens S7 Controller", "ip": ["10.1.1.2"], "os_or_firmware": "null"},
    ]),
    "claroty-xdome-devices": ("claroty_uid", [
        {"uid": "c1", "device_name": "Pump A", "dhcp_hostnames": ["pump-a"], "ip_list": ["10.2.2.2"], "mac_list": ["aa:bb:cc:00:00:02"], "combined_os": "VxWorks", "device_category": "OT"},
        {"uid": "c2", "device_name": "Infusion Pump 2", "ip_list": ["10.2.2.3"]},
    ]),
    "bigfix-clients": ("bigfix_id", [
        {"client_id": "1001", "nt_host": "SRV-1.corp.example.com", "ip": "10.3.3.3|IP Address property duplicates: a=1", "mac": "AA:BB:CC:00:00:03|AA:BB:CC:00:00:04",
         "dns": "srv-1.corp.example.com", "operating_system": "Win2019 10.0.17763", "user": "alice|bob"},
        {"client_id": "1002", "nt_host": "missing Name", "ip": "10.3.3.4"},
    ]),
    "manageengine-endpoint-central": ("manageengine_id", [
        {"resource_id": "m1", "resource_name": "PC-5", "ip_address": "10.4.4.4, 10.4.4.5", "fqdn_name": "pc-5.corp.example.com", "vulnerabilityname": "x"},
        {"resource_id": "m1", "resource_name": "PC-5", "ip_address": "10.4.4.4, 10.4.4.5", "fqdn_name": "pc-5.corp.example.com", "vulnerabilityname": "y"},
    ]),
    "trellix-epo-systems": ("nt_host", [
        {"computerName": "PC-6", "ipAddress": "10.5.5.5,10.5.5.6", "macAddress": "AA:BB:CC:00:00:05", "dnsName": "pc-6.corp.example.com", "operatingSystem": "Windows 11"},
        {"computerName": "MAC-7", "osType": "macOS", "osVersion": "14.4", "ipAddress": "10.5.5.7"},
    ]),
    "device42-devices": ("device42_id", [
        {"Devices": [{"device_id": 1, "name": "nyc-sw1.corp.example.com", "os": "IOS", "type": "physical", "ip_addresses": [{"ip": "10.6.6.6", "mac": "AA:BB:CC:00:00:06"}]},
                     {"device_id": 2, "name": "web2", "ip_addresses": [{"ip": "10.6.6.7"}]}]},
    ]),
    "workspace-one-devices": ("workspace_one_id", [
        {"DeviceId": "88", "DeviceFriendlyName": "IPHONE-JANE", "SerialNumber": "F2LXYZ", "UserEmailAddress": "jane@example.com"},
        {"DeviceId": "89", "DeviceFriendlyName": "Jane's iPhone", "SerialNumber": "F2LABC"},
    ]),
    "cisco-secure-endpoint-computers": ("cisco_se_id", [
        {"EndpointDataType": "computers", "connector_guid": "g1", "hostname": "PC-7.corp.example.com", "active": True, "operating_system": "Windows 10", "internal_ips": ["10.7.7.7"],
         "network_addresses": [{"ip": "10.7.7.7", "mac": "AA:BB:CC:00:00:07"}], "external_ip": "203.0.113.50"},
        {"EndpointDataType": "computers", "connector_guid": "g2", "hostname": "OLD-1", "active": False},
    ]),
    "symantec-endpoint-protection": ("nt_host", [
        {"Host_Name": "PC-8", "IP_Address": "10.8.8.8", "Domain_Name": "CORP"},
        {"Computer_Name": "PC-9.corp.example.com", "Source_Computer_IP": "10.8.8.9"},
    ]),
}


def spl_string(value):
    return '"%s"' % json.dumps(value).replace("\\", "\\\\").replace('"', '\\"')


def one(row, key):
    # source lookups hold multivalue fields as |-joined strings (that is what input_adb_lookup splits)
    value = row.get(key)
    value = value if isinstance(value, list) else ([] if value in (None, "") else [value])
    return sorted(part for item in value for part in str(item).split("|"))


def run_template(splunk, run_id, name, events):
    template = saved_search(splunk, "assetdb-src-" + name)["search"]
    base, rest = template.split(" | ", 1)
    feed = " ".join("| append [| makeresults | eval _raw=%s | spath]" % spl_string(e) for e in events)
    spl = "| makeresults | where 1=0 %s | %s" % (feed, rest)
    lookup = "adbtest_%s_%s.csv" % (run_id, name.replace("-", "_"))
    spl = re.sub(r"assetdb_src_\w+\.csv", lookup, spl)
    try:
        splunk.search_job(spl)
        return list(splunk.search("| inputlookup %s" % lookup))
    finally:
        splunk.delete("/servicesNS/nobody/%s/data/lookup-table-files/%s" % (APP, lookup))


@pytest.mark.parametrize("name", sorted(SAMPLES))
def test_vendor_template_builds_the_source_lookup(splunk, run_id, name):
    key, events = SAMPLES[name]
    rows = run_template(splunk, run_id, name, events)
    by = dict((r.get(key) or r.get("ip"), r) for r in rows)   # an interface with no MAC address is keyed on its address
    assert rows, name
    assert all(r.get("source_lookup", "").startswith("adbtest_") for r in rows), "output_adb_lookup adds the source_lookup column"
    CHECKS[name](by, rows)


def _crowdstrike(by, rows):
    r = by["c1"]
    assert one(r, "nt_host") == ["win10-001"] and one(r, "dns") == ["win10-001.corp.example.com"] and one(r, "ip") == ["10.3.3.3"], r
    assert one(r, "mac") == ["aa-bb-cc-dd-ee-20"] and one(r, "os") == ["Windows 10"], "the OS version that already names the platform is not doubled"
    assert "203.0.113.9" not in json.dumps(rows), "the external (NAT) address is not used as a key"
    assert one(by["c2"], "nt_host") == ["mac-02"] and one(by["c2"], "dns") == ["mac-02.corp.example.com"] and one(by["c2"], "os") == ["Mac Sonoma"]


def _tenable(by, rows):
    assert one(by["t1"], "nt_host") == ["web01"] and one(by["t1"], "ip") == ["10.2.2.2"] and one(by["t1"], "os") == ["Ubuntu 22.04"]
    assert one(by["t1"], "dns") == ["web01.corp.example.com"] and one(by["t1"], "mac") == ["aa:bb:cc:dd:ee:10"]
    assert one(by["t2"], "ip") == ["10.2.2.3"] and one(by["t2"], "nt_host") == ["db01"], "the per-interface copies are read, and an address in hostnames is not a host name"
    assert one(by["t2"], "dns") == ["db01.corp.example.com"]
    assert "t3" not in by, "terminated assets are left out"


def _servicenow(by, rows):
    r = by["s1"]
    assert one(r, "nt_host") == ["srv01"] and one(r, "dns") == ["srv01.corp.example.com"] and one(r, "ip") == ["10.4.4.4"] and one(r, "os") == ["Windows Server 2019"], r
    assert one(r, "owner") == ["Ann Lee"] and one(r, "category") == ["cmdb_ci_win_server"] and one(r, "mac") == ["AA:BB:CC:00:00:01"]
    assert "s2" not in by, "retired CIs are left out"
    assert one(by["s3"], "dns") == ["vm02.corp.example.com"], "a short name and a DNS domain give the FQDN"


def _qualys(by, rows):
    assert len(rows) == 2, "one row per host, not per finding"
    assert one(by["10.5.5.5"], "nt_host") == ["app01"] and one(by["10.5.5.5"], "dns") == ["app01.corp.example.com"] and one(by["10.5.5.5"], "os") == ["Windows Server 2016"]
    assert one(by["10.5.5.6"], "ip") == ["10.5.5.6"] and not one(by["10.5.5.6"], "nt_host")


def _rapid7(by, rows):
    r = by["r1"]
    assert one(r, "nt_host") == ["db02"] and one(r, "dns") == ["db02.corp.example.com"] and one(r, "mac") == ["AA:BB:CC:DD:EE:30"] and one(r, "os") == ["Microsoft Windows 2019"], r
    assert not one(by["r2"], "nt_host") and not one(by["r2"], "dns"), "an address in host_name is not a host name"


def _armis(by, rows):
    r = by["1"]
    assert sorted(one(r, "ip")) == ["10.7.7.7", "10.7.7.8", "fe80::1"] and one(r, "mac") == ["aa:bb:cc:dd:ee:40"] and one(r, "nt_host") == ["printer-01"], r
    assert one(r, "os") == ["Linux 5.4"] and one(r, "category") == ["Printers"]
    assert not one(by["2"], "nt_host") and one(by["2"], "mac") == ["aa:bb:cc:dd:ee:41"], "a name with a space is not a host name"


def _axonius(by, rows):
    r = by["ax1"]
    assert one(r, "nt_host") == ["host01"] and one(r, "dns") == ["host01.corp.example.com"] and one(r, "ip") == ["10.8.8.8"] and one(r, "mac") == ["AA:BB:CC:DD:EE:50"] and one(r, "os") == ["Windows 10"], r
    assert one(by["ax2"], "nt_host") == ["host02"] and one(by["ax2"], "ip") == ["10.8.8.9"] and one(by["ax2"], "os") == ["Linux"], "the short column names are read too"


def _lansweeper(by, rows):
    r = by["l1"]
    assert one(r, "nt_host") == ["pc-01"] and one(r, "dns") == ["pc-01.corp.example.com"] and one(r, "ip") == ["10.9.9.9"] and one(r, "mac") == ["AA:BB:CC:DD:EE:60"] and one(r, "os") == ["Windows 11"], r


def _jamf(by, rows):
    assert len(rows) == 1, "the three section events of a computer become one row"
    r = by["j1"]
    assert one(r, "nt_host") == ["mbp-01"] and one(r, "ip") == ["10.10.10.10"] and one(r, "mac") == ["AA:BB:CC:DD:EE:70", "AA:BB:CC:DD:EE:71"] and one(r, "os") == ["macOS 14.4"], r
    assert "203.0.113.5" not in json.dumps(rows), "the address Jamf sees (often a shared public one) is not used"


def _aws(by, rows):
    r = by["i-0abc"]
    assert one(r, "nt_host") == ["web-01"] and one(r, "ip") == ["10.11.11.11"] and one(r, "dns") == ["ip-10-11-11-11.ec2.internal"] and one(r, "os") == ["Windows"], r
    assert "198.51.100.7" not in json.dumps(rows), "the public address is not used"
    assert one(by["i-0def"], "nt_host") == ["ip-10-11-11-12"] and one(by["i-0def"], "os") == ["Linux/UNIX"]
    assert "i-0ghi" not in by, "terminated instances are left out"


def _sentinelone(by, rows):
    r = by["a1"]
    assert one(r, "nt_host") == ["lt-01"] and one(r, "dns") == ["lt-01.corp.example.com"] and one(r, "ip") == ["10.12.12.12", "fe80::1"], r
    assert one(r, "mac") == ["AA:BB:CC:DD:EE:80", "AA:BB:CC:DD:EE:81"] and one(r, "os") == ["Windows 10 Pro 19045"] and one(r, "category") == ["laptop"]
    assert "203.0.113.20" not in json.dumps(rows) and "a2" not in by, "the external address is not used; decommissioned agents are left out"


def _tanium_inventory(by, rows):
    r = by["AA:BB:CC:DD:EE:90"]
    assert one(r, "nt_host") == ["ws-02"] and one(r, "dns") == ["ws-02.corp.example.com"] and one(r, "ip") == ["10.13.13.13"] and one(r, "mac") == ["AA:BB:CC:DD:EE:90"], r
    assert one(r, "os") == ["Windows 10"] and one(r, "tanium_serial") == ["SN1"]


def _tanium_discover(by, rows):
    assert one(by["AA:BB:CC:DD:EE:91"], "nt_host") == ["cam-1"] and one(by["AA:BB:CC:DD:EE:91"], "ip") == ["10.14.14.14"] and one(by["AA:BB:CC:DD:EE:91"], "mac") == ["AA:BB:CC:DD:EE:91"]
    assert one(by["10.14.14.15"], "ip") == ["10.14.14.15"] and not one(by["10.14.14.15"], "mac"), "an interface with no MAC address is kept, keyed on its address"


def _carbon_black(by, rows):
    r = by["d1"]
    assert one(r, "nt_host") == ["desktop-1"] and one(r, "ip") == ["10.15.15.15"] and one(r, "mac") == ["AABBCCDDEE92"] and one(r, "os") == ["Windows 10 x64"], r
    assert "d2" not in by, "deregistered sensors are left out"


def _azure(by, rows):
    assert len(rows) == 1, "network interfaces are joined to their VM, and an interface without a VM is dropped"
    r = by["guid-1"]
    assert one(r, "nt_host") == ["vm1"] and one(r, "ip") == ["10.16.16.16"] and one(r, "mac") == ["00-0D-3A-11-22-33"] and one(r, "os") == ["Windows"], r


def _entra(by, rows):
    r = by["e1"]
    assert one(r, "nt_host") == ["laptop-9"] and one(r, "os") == ["Windows 10.0.19045"], r
    assert "e2" not in by, "disabled devices are left out"


def _gcp(by, rows):
    r = by["projects/p1/zones/europe-west1-b/instances/gce-01"]
    assert one(r, "nt_host") == ["gce-01"] and one(r, "ip") == ["10.17.17.17"], r
    assert "203.0.113.30" not in json.dumps(rows), "the external (NAT) address is not used"


def _cortex(by, rows):
    r = by["x1"]
    assert one(r, "nt_host") == ["ws-7"] and one(r, "dns") == ["ws-7.corp.example.com"] and one(r, "ip") == ["10.18.18.18"] and one(r, "os") == ["WINDOWS 10.0.1"], r
    assert "x2" not in by, "uninstalled agents are left out"


def _forescout(by, rows):
    r = by["10.19.19.19"]
    assert one(r, "mac") == ["aabbccddee95"] and one(r, "nt_host") == ["printer1"] and one(r, "category") == ["Printer"], r
    assert one(by["10.19.19.20"], "category") == ["Linux Desktop/Server"], "a host with only the properties the add-on's samples carry is kept"


def _meraki(by, rows):
    r = by["Q2XX-1"]
    assert one(r, "nt_host") == ["ap-lobby"] and one(r, "ip") == ["10.20.20.20"] and one(r, "mac") == ["e0:cb:bc:00:00:01"] and one(r, "category") == ["wireless"], r
    assert not one(by["Q2XX-2"], "nt_host"), "a device name with spaces is not a host name"


def _wiz(by, rows):
    r = by["i-1"]
    assert one(r, "nt_host") == ["ip-10-21-21-21"] and one(r, "ip") == ["10.21.21.21"] and one(r, "mac") == ["0a:1b:2c:3d:4e:5f"], r


def _runzero(by, rows):
    r = by["r1"]
    assert one(r, "nt_host") == ["ws-01"] and one(r, "dns") == ["ws-01.corp.example.com"] and one(r, "mac") == ["aa:bb:cc:00:11:22"], r
    assert one(r, "ip") == ["10.0.0.5", "fe80::1"], "a public address of the asset is not kept"
    assert one(r, "os") == ["Windows 10 10.0.19045"] and one(r, "category") == ["Desktop"]
    assert not one(by["r2"], "nt_host") and one(by["r2"], "ip") == ["192.168.1.9"], "a name that is an address is not a host name"


def _nozomi(by, rows):
    r = by["n1"]
    assert one(r, "nt_host") == ["plc-01"] and one(r, "ip") == ["10.1.1.1"] and one(r, "mac") == ["aa:bb:cc:00:00:01"] and one(r, "os") == ["FW 1.2"] and one(r, "category") == ["plc"], r
    assert not one(by["n2"], "nt_host") and not one(by["n2"], "os"), "a name with spaces is not a host name, and the add-on's string null is no value"


def _claroty(by, rows):
    r = by["c1"]
    assert one(r, "nt_host") == ["pump-a"] and one(r, "ip") == ["10.2.2.2"] and one(r, "mac") == ["aa:bb:cc:00:00:02"] and one(r, "os") == ["VxWorks"] and one(r, "category") == ["OT"], r
    assert not one(by["c2"], "nt_host") and one(by["c2"], "ip") == ["10.2.2.3"]


def _bigfix(by, rows):
    r = by["1001"]
    assert one(r, "nt_host") == ["srv-1"] and one(r, "dns") == ["srv-1.corp.example.com"] and one(r, "owner") == ["alice"] and one(r, "os") == ["Win2019 10.0.17763"], r
    assert one(r, "ip") == ["10.3.3.3"], "the add-on's duplicate-property error text is not an address"
    assert one(r, "mac") == ["AA:BB:CC:00:00:03", "AA:BB:CC:00:00:04"]
    assert not one(by["1002"], "nt_host") and one(by["1002"], "ip") == ["10.3.3.4"], "missing Name is not a host name"


def _manageengine(by, rows):
    assert len(rows) == 1, "one row per computer, not per vulnerability"
    r = by["m1"]
    assert one(r, "nt_host") == ["pc-5"] and one(r, "dns") == ["pc-5.corp.example.com"] and one(r, "ip") == ["10.4.4.4", "10.4.4.5"], r


def _trellix(by, rows):
    r = by["pc-6"]
    assert one(r, "ip") == ["10.5.5.5", "10.5.5.6"] and one(r, "mac") == ["AA:BB:CC:00:00:05"] and one(r, "dns") == ["pc-6.corp.example.com"] and one(r, "os") == ["Windows 11"], r
    assert one(by["mac-7"], "os") == ["macOS 14.4"] and one(by["mac-7"], "ip") == ["10.5.5.7"]


def _device42(by, rows):
    r = by["1"]
    assert one(r, "nt_host") == ["nyc-sw1"] and one(r, "dns") == ["nyc-sw1.corp.example.com"] and one(r, "ip") == ["10.6.6.6"] and one(r, "mac") == ["aa:bb:cc:00:00:06"] and one(r, "os") == ["IOS"], r
    assert one(by["2"], "nt_host") == ["web2"] and not one(by["2"], "dns")


def _workspace_one(by, rows):
    r = by["88"]
    assert one(r, "nt_host") == ["iphone-jane"] and one(r, "serial") == ["F2LXYZ"] and one(r, "owner") == ["jane@example.com"], r
    assert not one(by["89"], "nt_host") and one(by["89"], "serial") == ["F2LABC"], "a friendly name with spaces is not a host name"


def _cisco_se(by, rows):
    assert "g2" not in by, "an inactive computer is left out"
    r = by["g1"]
    assert one(r, "nt_host") == ["pc-7"] and one(r, "dns") == ["pc-7.corp.example.com"] and one(r, "ip") == ["10.7.7.7"] and one(r, "mac") == ["aa:bb:cc:00:00:07"] and one(r, "os") == ["Windows 10"], r
    assert "203.0.113.50" not in json.dumps(rows), "the external (NAT) address is not used as a key"


def _symantec(by, rows):
    assert one(by["pc-8"], "ip") == ["10.8.8.8"] and one(by["pc-9"], "dns") == ["pc-9.corp.example.com"] and one(by["pc-9"], "ip") == ["10.8.8.9"]


CHECKS = {
    "crowdstrike-devices": _crowdstrike, "tenable-assets": _tenable, "servicenow-cmdb": _servicenow, "qualys-vmdr-hosts": _qualys, "rapid7-insightvm": _rapid7,
    "armis-devices": _armis, "axonius-devices": _axonius, "lansweeper-assets": _lansweeper, "jamf-computers": _jamf, "aws-ec2-instances": _aws,
    "sentinelone-agents": _sentinelone, "tanium-inventory": _tanium_inventory, "tanium-discover": _tanium_discover, "carbon-black-cloud-devices": _carbon_black,
    "azure-virtual-machines": _azure, "entra-devices": _entra, "gcp-compute-instances": _gcp, "cortex-xdr-endpoints": _cortex, "forescout-hosts": _forescout,
    "meraki-devices": _meraki, "wiz-virtual-machines": _wiz,
    "runzero-assets": _runzero, "nozomi-assets": _nozomi, "claroty-xdome-devices": _claroty, "bigfix-clients": _bigfix, "manageengine-endpoint-central": _manageengine,
    "trellix-epo-systems": _trellix, "device42-devices": _device42, "workspace-one-devices": _workspace_one, "cisco-secure-endpoint-computers": _cisco_se,
    "symantec-endpoint-protection": _symantec,
}


def test_every_vendor_template_has_a_sample():
    assert set(SAMPLES) == set(VENDOR) == set(CHECKS)
