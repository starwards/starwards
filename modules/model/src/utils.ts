export function getConstant(constants: Map<string, number>, name: string): number {
    const result = constants.get(name);
    if (result === undefined) {
        throw new Error(`missing constant value: ${name}`);
    }
    return result;
}
