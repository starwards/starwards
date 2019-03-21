import {Kind, ValueNode, IntValueNode, FloatValueNode} from 'graphql/language';
import {GraphQLScalarType} from 'graphql';
import { vec2 } from '@starwards/tsm';

function serialize(value: vec2 | null) {
    return value && value.xy;
  }

function parseValue(value: [number, number] | null) {
  return value && new vec2(value);
}

function isNumberAst(n: ValueNode | null): n is IntValueNode | FloatValueNode {
  return !!n && (n.kind === Kind.FLOAT || n.kind === Kind.INT);
}

function parseLiteral(ast: ValueNode) {
  if (ast.kind === Kind.LIST) {
    const x = ast.values[0];
    const y = ast.values[1];
    if (isNumberAst(x) && isNumberAst(y)) {
      return new vec2([parseFloat(x.value), parseFloat(y.value)]);
    }
  }
  return null;
}

export default new GraphQLScalarType({
  name: 'Vector',
  description: 'Vector',
  serialize, parseValue, parseLiteral
});
