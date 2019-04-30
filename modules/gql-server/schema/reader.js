const { readFileSync } = require('fs');
const { join } = require('path');

module.exports.readSchema = function readSchema(name){
    return readFileSync(join(__dirname, `./${name}.graphql`), 'utf8');
}