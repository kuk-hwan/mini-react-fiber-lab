"""Separate chaining hash table, lazy TTL, atomic commands and optional snapshots."""
import copy
import json
import math
import os
import threading
import time
from pathlib import Path


class HashTable:
    def __init__(self, capacity=16):
        self.buckets = [[] for _ in range(max(4, capacity))]
        self.size = 0

    def slot(self, key):
        # FNV-1a: stable UTF-8 hash, not Python's built-in dict/hash storage.
        value = 2166136261
        for byte in key.encode('utf-8'):
            value = ((value ^ byte) * 16777619) & 0xffffffff
        return value % len(self.buckets)

    def get(self, key):
        for stored, value in self.buckets[self.slot(key)]:
            if stored == key:
                return value
        return None

    def set(self, key, value):
        bucket = self.buckets[self.slot(key)]
        for i, (stored, _) in enumerate(bucket):
            if stored == key:
                bucket[i] = (key, value)
                return
        bucket.append((key, value))
        self.size += 1
        if self.size > len(self.buckets) * .75:
            entries = list(self.items())
            self.buckets = [[] for _ in range(len(self.buckets) * 2)]
            self.size = 0
            for stored, entry in entries:
                self.set(stored, entry)

    def delete(self, key):
        bucket = self.buckets[self.slot(key)]
        for i, (stored, _) in enumerate(bucket):
            if stored == key:
                bucket.pop(i)
                self.size -= 1
                return True
        return False

    def items(self):
        for bucket in self.buckets:
            yield from bucket


class MiniRedis:
    def __init__(self, clock=time.time):
        self.table = HashTable()
        self.clock = clock
        self.lock = threading.RLock()
        self.hits = self.misses = self.expired = 0

    def set(self, key, value, ttl=None):
        if not isinstance(key, str) or not key or len(key.encode('utf-8')) > 1024:
            raise ValueError('key must be a nonempty UTF-8 string up to 1024 bytes')
        if ttl is not None and (type(ttl) not in (int, float) or not math.isfinite(ttl) or ttl < 0):
            raise ValueError('ttl must be a finite nonnegative number of seconds')
        json.dumps(value, allow_nan=False)
        with self.lock:
            self.table.set(key, (copy.deepcopy(value), None if ttl is None else self.clock() + ttl))

    def get(self, key):
        with self.lock:
            entry = self.table.get(key)
            if entry is not None and entry[1] is not None and entry[1] <= self.clock():
                self.table.delete(key)
                self.expired += 1
                entry = None
            if entry is None:
                self.misses += 1
                return {'found': False, 'value': None}
            self.hits += 1
            return {'found': True, 'value': copy.deepcopy(entry[0])}

    def delete(self, key):
        with self.lock:
            entry = self.table.get(key)
            if entry is None:
                return False
            self.table.delete(key)
            if entry[1] is not None and entry[1] <= self.clock():
                self.expired += 1
                return False
            return True

    def sweep(self):
        with self.lock:
            now = self.clock()
            dead = [key for key, (_, expiry) in self.table.items() if expiry is not None and expiry <= now]
            for key in dead:
                self.table.delete(key)
            self.expired += len(dead)
            return len(dead)

    def stats(self):
        with self.lock:
            self.sweep()
            lengths = [len(bucket) for bucket in self.table.buckets]
            return {'keys': self.table.size, 'capacity': len(lengths), 'hits': self.hits,
                    'misses': self.misses, 'expired': self.expired,
                    'max_chain': max(lengths), 'bucket_lengths': lengths[:64]}

    def snapshot(self, path):
        # The lock covers write+replace so concurrent snapshots cannot race.
        with self.lock:
            self.sweep()
            target = Path(path)
            target.parent.mkdir(parents=True, exist_ok=True)
            temporary = target.with_suffix('.tmp')
            with temporary.open('w', encoding='utf-8') as stream:
                json.dump(list(self.table.items()), stream, ensure_ascii=False, allow_nan=False)
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(temporary, target)

    def restore(self, path):
        target = Path(path)
        if not target.exists():
            return
        entries = json.loads(target.read_text(encoding='utf-8'))
        with self.lock:
            replacement = HashTable()
            for key, (value, expiry) in entries:
                if expiry is None or expiry > self.clock():
                    replacement.set(key, (value, expiry))
            self.table = replacement
