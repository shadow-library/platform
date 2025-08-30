const contents = 'lorem ipsum dolor sit amet';

const n = 100_000_000;

function mask(input) {
  if (!input) return input;
  if (input.includes(' '))
    return input
      .split(' ')
      .map(part => mask(part))
      .join(' ');
  if (input.length <= 3) return '*'.repeat(input.length);
  let output = input[0];
  for (let index = 1; index < input.length - 1; index++) output += '*';
  output += input[input.length - 1];
}

{
  const start = process.hrtime();
  for (let i = 0; i < n; i++) {
    mask(contents);
  }
  const end = process.hrtime(start);
  console.log(`Split Execution time: ${end[0]}s ${end[1] / 1_000_000}ms`);
}

{
  const start = process.hrtime();
  for (let i = 0; i < n; i++) {
    const n = contents.length;
    let output = '';

    let wordStart = -1;
    for (let i = 0; i < n; i++) {
      const ch = contents[i];
      if (ch === ' ') {
        output += ' ';
        if (wordStart !== -1) {
          if (i - wordStart > 1) output += contents[i - 1];
          wordStart = -1;
        }
      } else {
        if (wordStart === -1) {
          wordStart = i;
          output += ch;
        } else if (contents[i + 1] === ' ' || i === n - 1) {
          output += ch;
          i++;
        } else output += '*';
      }
    }
  }
  const end = process.hrtime(start);
  console.log(`Char Execution time: ${end[0]}s ${end[1] / 1_000_000}ms`);
}
