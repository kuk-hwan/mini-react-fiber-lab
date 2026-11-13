"""Memory B+ tree: internal separators, linked leaves, ID -> file byte offset."""
from bisect import bisect_left, bisect_right
from dataclasses import dataclass, field


@dataclass
class Node:
    leaf: bool = True
    keys: list = field(default_factory=list)
    values: list = field(default_factory=list)
    children: list = field(default_factory=list)
    next: 'Node | None' = None


class BPlusTree:
    def __init__(self, order=64):
        if order < 3:
            raise ValueError('order must be at least 3')
        self.order = order
        self.root = Node()
        self.size = 0

    def lookup(self, key):
        node, visited = self.root, 1
        while not node.leaf:
            node = node.children[bisect_right(node.keys, key)]
            visited += 1
        i = bisect_left(node.keys, key)
        value = node.values[i] if i < len(node.keys) and node.keys[i] == key else None
        return value, visited

    def insert(self, key, value):
        def put(node):
            if node.leaf:
                i = bisect_left(node.keys, key)
                if i < len(node.keys) and node.keys[i] == key:
                    node.values[i] = value
                    return None
                node.keys.insert(i, key)
                node.values.insert(i, value)
                self.size += 1
            else:
                i = bisect_right(node.keys, key)
                split = put(node.children[i])
                if split:
                    separator, right = split
                    node.keys.insert(i, separator)
                    node.children.insert(i + 1, right)
            if len(node.keys) < self.order:
                return None
            mid = len(node.keys) // 2
            if node.leaf:
                right = Node(keys=node.keys[mid:], values=node.values[mid:], next=node.next)
                node.keys = node.keys[:mid]
                node.values = node.values[:mid]
                node.next = right
                return right.keys[0], right
            separator = node.keys[mid]
            right = Node(leaf=False, keys=node.keys[mid + 1:], children=node.children[mid + 1:])
            node.keys = node.keys[:mid]
            node.children = node.children[:mid + 1]
            return separator, right

        split = put(self.root)
        if split:
            separator, right = split
            self.root = Node(leaf=False, keys=[separator], children=[self.root, right])

    def items(self, low=0, high=float('inf')):
        node = self.root
        while not node.leaf:
            node = node.children[bisect_right(node.keys, low)]
        while node:
            for key, value in zip(node.keys, node.values):
                if key > high:
                    return
                if key >= low:
                    yield key, value
            node = node.next

    def stats(self):
        levels, nodes = [], [self.root]
        while nodes:
            levels.append(len(nodes))
            nodes = [child for node in nodes for child in node.children]
        return {'entries': self.size, 'height': len(levels), 'nodes_per_level': levels, 'order': self.order}
