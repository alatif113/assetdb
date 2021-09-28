# AssetDB

AssetDB is a Splunk application that allows merging distinct data sources into an asset data base, without the need for Splunk Enterprise Security. The app is currently in beta and may be prone to bugs. 

## Usage

Navigate to the "Configure" tab to configure AssetDB

### Asset Lookups

Create lookup files and corresponding lookup generation searches for each unqiue data source that provides asset information. 

 - **Add lookup file**: Click the *Add Lookup* button to add a lookup file to be used to populate the merged *Asset Database*. A demo lookup file, *assetdb_demo_assets.csv* is provided by default. 

 - **Delete lookup file**: Click the *Delete* link next to an existing lookup file in the *Lookups Table* to remove the lookup and prevent its contents from being merged into the *Asset Database*.

### Asset Fields

Create fields to be stored within the *Asset Database* and merged between all input lookup files. 

- **Add field**: Click the *Add Field* button to add a new field into the *Asset Database*. See the **Field Properties** section below for more information on field properties. Predefined fields are provided by default, but can be edited or deleted if needed. 

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

AssetDB uses *Key Fields* to merge assets together into a single *Asset Database*. The below is an example of how the merge process operates, across 4 input lookup files, where *mac* and *nt_host* are defined as key fields. All fields are of Field Type *Mutivalue*.

1. Lookup files are concatenated together
![merge_1.png](https://raw.githubusercontent.com/alatif113/assetdb/main/static/merge_1.png)

2. A key is generated, composed of all *Key Field* values
![merge_2.png](https://raw.githubusercontent.com/alatif113/assetdb/main/static/merge_2.png)

3. Asset from `lookup_A` and Asset from `lookup_B` share a key `mac_A`
![merge_3.png](https://raw.githubusercontent.com/alatif113/assetdb/main/static/merge_3.png)

4. Asset from `lookup_A` and Asset from `lookup_B` are merged
![merge_4.png](https://raw.githubusercontent.com/alatif113/assetdb/main/static/merge_4.png)

5. The newly merged Asset and Asset from `lookup_C` share a key `host_B`
![merge_5.png](https://raw.githubusercontent.com/alatif113/assetdb/main/static/merge_5.png)

6. The newly merged Asset and Asset from `lookup_C` are merged. The Asset from `lookup_D` does not share keys with any other asset. It is not merged. 
![merge_6.png](https://raw.githubusercontent.com/alatif113/assetdb/main/static/merge_6.png)


Note how although, the Asset from `lookup_A` and Asset from `lookup_C` do not share any keys, they end up being merged due to both sharing keys with the Asset from `lookup_B`.

### Asset Merge Search

Merging is done via a custom command `adbmerge` and saved search `assetdb-lookupgen` that runs on a user defined frequency. By default, this frequency is once a day. The saved search is automatically updated based on *Lookup* and *Field* configurations. Merged assets are outputted to the `assetdb` KV store. 




