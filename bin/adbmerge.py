#!/usr/bin/env python2.7

import sys
import os
import logging

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "lib"))
from splunklib.searchcommands import \
    dispatch, ReportingCommand, Configuration, Option

from splunklib.searchcommands.validators import Integer

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
        key_map = {}
        event_map = {}
        null_keys = 0
        large_keys = 0
        total = 0

        for event in events:
            total += 1
            key_list = event['_key'] if isinstance(event['_key'], list) else [event['_key']]

            if '' in key_list:
                key_list.remove('')
            
            if len(key_list) == 0:
                null_keys += 1
                continue

            key_set = set(key_list)

            for key in key_list:
                if key not in key_map:
                    key_map[key] = key_set
                else:
                    key_set = key_set.union(key_map.get(key, {}))

            for key in key_set:
                if len(key_set) > self.max_keys or 'MAX_KEYS_REACHED' in key_set:
                    key_map[key] = {'MAX_KEYS_REACHED'}
                else:
                    key_map[key] = key_set 
            
            first_key = key_list[0]

            if first_key not in event_map:
                event_map[first_key] = [event]
            else:
                event_map[first_key].append(event)
            
        for key in event_map:
            for event in event_map[key]:
                key_list = list(key_map[key])

                if key_list[0] == 'MAX_KEYS_REACHED':
                    large_keys += 1

                event['asset'] = key_list

                yield event

        self.logger.warning('Ignored {}/{} assets with null keys'.format(null_keys, total))
        self.logger.warning('Ignored {}/{} assets which share more than {} unique keys.'.format(large_keys, total, self.max_keys))
        
dispatch(ADBMergeCommand, sys.argv, sys.stdin, sys.stdout, __name__)
