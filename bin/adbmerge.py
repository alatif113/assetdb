#!/usr/bin/env python3

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "lib"))
from splunklib.searchcommands import \
    dispatch, ReportingCommand, Configuration, Option

from splunklib.searchcommands.validators import Integer

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from adbmerge_core import HARD_MAX_KEYS, merge

@Configuration()
class ADBMergeCommand(ReportingCommand):

    max_keys = Option(doc='''
        **Syntax:** **max_keys=***<number>*
        **Description:** The maximum number of unique keys a merged asset can have (1-100). Assets in a larger cluster are dropped (and counted in the log). Large numbers of keys can reduce merge performance.
        ''', require=True, validate=Integer(1, HARD_MAX_KEYS))

    @Configuration()
    def map(self, events):
        for event in events:
            yield event

    def reduce(self, events):
        result = merge(events, self.max_keys)
        stats = result.stats

        for event in result.merged:
            yield event

        self.logger.info('adbmerge: {total} assets in, {null_keys} ignored with null keys, {large_keys} dropped for sharing more than {max_keys} '
                         'unique keys, {enrich_unmatched} enrich rows matched no asset, {enrich_ambiguous} matched several'.format(max_keys=self.max_keys, **stats))
        dropped = stats['null_keys'] + stats['large_keys'] + stats['enrich_unmatched'] + stats['enrich_ambiguous']
        if dropped:
            self.logger.warning('adbmerge: dropped {dropped}/{total} assets (null keys {null_keys}, more than {max_keys} unique keys {large_keys}, '
                                'unmatched enrich rows {enrich_unmatched}, ambiguous enrich rows {enrich_ambiguous})'.format(
                                    dropped=dropped, max_keys=self.max_keys, **stats))

dispatch(ADBMergeCommand, sys.argv, sys.stdin, sys.stdout, __name__)
