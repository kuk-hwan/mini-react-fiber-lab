"""Small tokenizer/parser. Unsupported SQL is rejected, never evaluated."""
import re

TOKEN = re.compile(r"\s+|--[^\n]*|'(?:''|[^'])*'|-?\d+|[A-Za-z_][A-Za-z_0-9]*|[(),;*=]")


def parse(source):
    if not isinstance(source, str) or len(source) > 65536:
        raise ValueError('SQL must be a string up to 65536 characters')
    tokens, pos = [], 0
    while pos < len(source):
        match = TOKEN.match(source, pos)
        if not match:
            raise ValueError(f'Invalid SQL token at position {pos}')
        token = match.group()
        pos = match.end()
        if not token.isspace() and not token.startswith('--'):
            tokens.append(token)
    cursor = 0

    def take(expected=None):
        nonlocal cursor
        if cursor >= len(tokens):
            raise ValueError(f'Expected {expected or "token"}')
        token = tokens[cursor]
        cursor += 1
        if expected and token.upper() != expected:
            raise ValueError(f'Expected {expected}, got {token}')
        return token

    def peek(value):
        return cursor < len(tokens) and tokens[cursor].upper() == value

    def identifier():
        token = take()
        if not re.fullmatch(r'[A-Za-z_][A-Za-z_0-9]*', token):
            raise ValueError('Expected identifier')
        return token.lower()

    def literal():
        token = take()
        if token.startswith("'"):
            return token[1:-1].replace("''", "'")
        if re.fullmatch(r'-?\d+', token):
            return int(token)
        raise ValueError('Only integer and single-quoted text literals are supported')

    def sequence(read):
        values = [read()]
        while peek(','):
            take(',')
            values.append(read())
        return values

    statements = []
    while cursor < len(tokens):
        operation = take().upper()
        if operation == 'INSERT':
            take('INTO')
            table = identifier()
            take('(')
            columns = sequence(identifier)
            take(')')
            take('VALUES')
            take('(')
            values = sequence(literal)
            take(')')
            if len(columns) != len(values) or len(set(columns)) != len(columns):
                raise ValueError('Columns and values must match; duplicate columns are not allowed')
            statement = {'op': operation, 'table': table, 'values': dict(zip(columns, values))}
        elif operation == 'SELECT':
            if peek('*'):
                take('*')
                columns = ['*']
            else:
                columns = sequence(identifier)
            take('FROM')
            table = identifier()
            where = None
            if peek('WHERE'):
                take('WHERE')
                column = identifier()
                take('=')
                where = (column, literal())
            limit = 100
            if peek('LIMIT'):
                take('LIMIT')
                limit = literal()
                if type(limit) is not int or not 1 <= limit <= 1000:
                    raise ValueError('LIMIT must be an integer between 1 and 1000')
            statement = {'op': operation, 'table': table, 'columns': columns, 'where': where, 'limit': limit}
        else:
            raise ValueError('Only INSERT and SELECT are supported')
        statements.append(statement)
        if cursor < len(tokens):
            take(';')
    if not statements:
        raise ValueError('SQL is empty')
    return statements
