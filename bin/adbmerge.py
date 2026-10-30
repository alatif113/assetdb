#!/usr/bin/env python2.7

import sys
import os
import logging

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "lib"))
from splunklib.searchcommands import \
    dispatch, ReportingCommand, Configuration, Option

from splunklib.searchcommands.validators import Integer

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from adbmerge_core import merge_assets

@Configuration()
class ADBMergeCommand(ReportingCommand):

    max_keys = Option(doc='''
        **Syntax:** **max_keys=***<number>*
        **Description:** The maximum number of keys an asset can have before it is ignored. Large number of keys can reduce merge performance.
        ''', require=True, validate=Integer(1))
     
    @Configuration()
    def map(self, events):
        for event in events:
            yield event
    
    def reduce(self, events):
        merged, null_keys, large_keys, total = merge_assets(events, self.max_keys)

        for event in merged:
            yield event

        self.logger.warning('Ignored {}/{} assets with null keys'.format(null_keys, total))
        self.logger.warning('Ignored {}/{} assets which share more than {} unique keys.'.format(large_keys, total, self.max_keys))

dispatch(ADBMergeCommand, sys.argv, sys.stdin, sys.stdout, __name__)
