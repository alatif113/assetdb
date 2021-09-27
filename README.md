# AssetDB

AssetDB is a Splunk application that allows merging distinct data sources into an asset data base, without the need for Splunk Enterprise Security. The app is currently in development, and its README will be updated once it is stable with base functionality.

## Usage

Navigate to the "Configure" tab to configure AssetDB

### Lookups

Create lookup files and corresponding lookup generation searches for each unqiue data source that provides asset information. 

 - **Add lookup file**: Click the *Add Lookup* button to add a lookup file to be used to populate the merged *Asset Database*. A demo lookup file, *assetdb_demo_assets.csv* is provided by default. 

 - **Delete lookup file**: Click the *Delete* link next to an existing lookup file in the *Lookups Table* to remove the lookup and prevent its contents from being merged into the *Asset Database*.

### Fields

Create fields to be stored within the *Asset Database* and merged between all input lookup files. 

- **Add field**: Click the *Add Field* button to add a new field into the *Asset Database*. See the **Field Properties** section below for more information on field properties. 

- **Edit field**: Click the *Edit Field* button to edit an existing field into the *Asset Database*. See the **Field Properties** section below for more information on field properties. 

- **Delete field**: Click the *Delete Field* button to delete an existing field from the *Asset Database*. Deleting a field, does not remove that field from any underlying lookup files. 

### Field Properties

The following field properties can be set when adding a new field or editing an existing field. 

| Property | Description |
| ----------- | ----------- |
| Field Name | The name of the field. Must consist of alphanumeric characters or underscores. Field names *_key* and *asset* are automatically created during the asset merge process and cannot be overwritten. |
| Key Field | Whether the field is a key field or not. Key fields are fields that define a unqiue asset and are used during the asset merge process. See **How AssetDB Merges Assets** for more information on. |
| Case Sensitive | Wether the field is case sensitive or not. A value of *No* will set all field values to lower case. |
| Ignore Values | (Optional) A comma seperated list of field values to ignore (e.g. null,none,unknown). |
| Fill Null | (Optional) A static value to fill null entries of a field with (e.g. a default asset priority). | 
| Field Type | Defines the type of field. Use a single value, keep all unique entries as a multivalue, or use an eval expression to define this field. |
| Merge Method | (Only applicable when Field Type is *Single*) Defines how a single value is derived across the input lookup table files.<br>- **Latest**: the most recent value<br>- **Min**: minimum value, only applicable to numeric field values<br>- **Max**: maximum value, only applicable to numeric field values<br>- **Avg**: average value, only applicable to numeric field values<br>- **Coalesce**: define a precedence by ranking the source data with the *Coalesce* property |
| Coalesce | (Only applicable when Merge Method is *Coalesce*) Defines the precedence of source data to be used for this field. |
| Max Values | (Only applicable when Field Type is *Multivalue*) The maximum values the multivalue field can have. Excess values are trimmed. Large mutlivalue fields can lead to reduced performance. 
| Eval Expression | (Only applicable when Field Type is *Eval*) An SPL eval expression to define the field. 

### How AssetDB Merges Assets

AssetDB uses *Key Fields* to merge assets together into a single *Asset Database*. The below is an example of how the merge process operates, across 3 input lookup files, where *mac* and *nt_host* are defined as key fields. All fields are of Field Type *Mutivalue*.

**Input lookup files are concatenated together**

| `row` | `mac` | `nt_host` | `source` |
| ----------- | ----------- | ----------- | ----------- |
| `1` | `mac_1` | `nt_host_1` | `lookup_1` |
| `2` | `mac_1<br>mac_2` | `nt_host_2` | `lookup_2` |
| `3` | `mac_2` | `nt_host_3`<br>`nt_host_4` | `lookup_3` |
| `4` | `mac_5` | `nt_host_5` | `lookup_5` |

**A multivalue _key field is generated consisting of values from the configured Key Fields**

| `row` | `mac` | `nt_host` | `source` | `_key` |
| ----------- | ----------- | ----------- | ----------- | ----------- |
| `1` | `mac_1` | `nt_host_1` | `lookup_1` | `mac_1<br>nt_host_1` |
| `2` | `mac_1<br>mac_2` | `nt_host_2` | `lookup_2` | `mac_1`<br>`mac_2`<br>`nt_host_2` |
| `3` | `mac_2` | `nt_host_3`<br>`nt_host_4` | `lookup_3` | `mac_2`<br>`nt_host_3`<br>`nt_host_4` |
| `4` | `mac_5` | `nt_host_5` | `lookup_5` | `mac_5`<br>`nt_host_5` |

**Rows 1 and 2 are merged because they share a Key** ***`mac_1`***

| `row` | `mac` | `nt_host` | `source` | `_key` |
| ----------- | ----------- | ----------- | ----------- | ----------- |
| `1` | `mac_1<br>mac_2` | `nt_host_1`<br>`nt_host_2` | `lookup_1`<br>`lookup_2` | **`mac_1`**<br>`nt_host_1`<br>`mac_2`<br>`nt_host_2` |
| `2` | `mac_2` | `nt_host_3`<br>`nt_host_4` | `lookup_3` | `mac_2`<br>`nt_host_3`<br>`nt_host_4` |
| `3` | `mac_5` | `nt_host_5` | `lookup_5` | `mac_5`<br>`nt_host_5` |

**Rows 1 and 2 are merged because they share a Key** ***`mac_2`***

| `row` | `mac` | `nt_host` | `source` | `_key` |
| ----------- | ----------- | ----------- | ----------- | ----------- |
| `1` | `mac_1<br>mac_2` | `nt_host_1`<br>`nt_host_2`<br>`nt_host_3`<br>`nt_host_4` | `lookup_1`<br>`lookup_2`<br>`lookup_3` | `mac_1`<br>`nt_host_1`<br>**`mac_2`**<br>`nt_host_2`<br>`nt_host_3`<br>`nt_host_4` |
| `2` | `mac_5` | `nt_host_5` | `lookup_5` | `mac_5`<br>`nt_host_5` |

**Rows 2 is not merged because it does not share a Key with any other asset**

