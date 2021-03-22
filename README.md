# AssetDB

AssetDB is a Splunk application that allows merging distinct data sources into an asset data base, without the need for Splunk Enterprise. The app is currently in development, and its README will be updated once it is stable with it base functionality.

Version 1.0.0 will allow:

-   Adding lookups that contain asset data from distinct data sources
-   Configuring fields and how they should be merged across configured lookups, including
    -   Whether the field is a key field
    -   Whether the field is case sensitive
    -   The type of the field (single value, multi-value, or an eval expression)
    -   If single, how the values across lookups are merged to a single value
        -   Using the latest value
        -   Coalescing across lookups based on priority
    -   If multivalue, the maximum values within the field
    -   If eval expression, the specific expression to use
    -   Whether to ingore values (e.g., unknown, null, etc.)
    -   Wether to fill null values
-   Auto generating and saving an SPL query that merges configured lookups according to field specific merge settings
