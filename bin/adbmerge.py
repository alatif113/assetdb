#!/usr/bin/env python3

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "lib"))
from splunklib.searchcommands import \
    dispatch, ReportingCommand, Configuration, Option

from splunklib.searchcommands.validators import Integer

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from adbmerge_core import HARD_MAX_KEYS, merge, with_common_fields

@Configuration()
class ADBMergeCommand(ReportingCommand):

    max_keys = Option(doc='''
        **Syntax:** **max_keys=***<number>*
        **Description:** The maximum number of unique keys a merged asset can have (1-100). Assets in a larger cluster are dropped (and counted in the log). Large numbers of keys can reduce merge performance.
        ''', require=True, validate=Integer(1, HARD_MAX_KEYS))

    max_key_share = Option(doc='''
        **Syntax:** **max_key_share=***<number>*
        **Description:** A key found in more than this many input rows is not used to match assets (0 turns the check off). Such keys, e.g. a NAT address, would chain unrelated assets together.
        ''', require=False, default=0, validate=Integer(0, 1000000))

    overflow = Option(doc='''
        **Syntax:** **overflow=***<drop|emit>*
        **Description:** What to do with clusters larger than max_keys. drop (default) discards them; emit also outputs one event per cluster with adb_overflow=1, a sample of its keys and its size so they can be reviewed.
        ''', require=False, default='drop')

    @Configuration()
    def map(self, events):
        for event in events:
            yield event

    def reduce(self, events):
        # Splunk's chunked protocol calls reduce once per input chunk, and a chunk holds only part of the rows (tens of thousands).
        # Merging per chunk would silently miss every cluster that spans two chunks, so the rows are collected and merged once, in
        # the last chunk. Only the keys are sent through this command (see the generated search), which keeps the buffer small.
        if not hasattr(self, '_adb_buffer'):
            self._adb_buffer = []
        self._adb_buffer.extend(events)
        if not self._finished:
            return
        events, self._adb_buffer = self._adb_buffer, []

        if self.overflow not in ('drop', 'emit'):
            raise ValueError('overflow must be drop or emit')
        result = merge(events, self.max_keys, self.max_key_share, emit_overflow=(self.overflow == 'emit'))
        stats = result.stats
        result.annotate()

        for event in with_common_fields(list(result.merged) + list(result.overflow)):
            yield event

        self.logger.info('adbmerge: {total} assets in, {null_keys} ignored with null keys, {large_keys} dropped for sharing more than {max_keys} '
                         'unique keys, {enrich_unmatched} enrich rows matched no asset, {enrich_ambiguous} matched several, {junk_keys} keys shared by more than {share} rows were not used to match ({junk_rows} rows left without a key)'.format(
                             max_keys=self.max_keys, share=self.max_key_share, **stats))
        if result.junk:
            self.logger.warning('adbmerge: keys not used to match because too many rows share them: {}'.format(
                ', '.join('{} ({} rows)'.format(key, n) for key, n in result.junk[:10])))
        dropped = stats['null_keys'] + stats['large_keys'] + stats['enrich_unmatched'] + stats['enrich_ambiguous'] + stats['junk_rows']
        if dropped:
            self.logger.warning('adbmerge: dropped {dropped}/{total} assets (null keys {null_keys}, more than {max_keys} unique keys {large_keys}, '
                                'unmatched enrich rows {enrich_unmatched}, ambiguous enrich rows {enrich_ambiguous}, rows left without a key after removing shared keys {junk_rows})'.format(
                                    dropped=dropped, max_keys=self.max_keys, **stats))

dispatch(ADBMergeCommand, sys.argv, sys.stdin, sys.stdout, __name__)
