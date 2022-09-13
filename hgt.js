const { readFile } = require('fs');
const { promisify } = require('util');
const asyncReadFile = promisify(readFile);

const INT_MAX = 32767

function avg(v1, v2, f) {
  // Case 1: One pixel is INT_MAX --> return other pixel. Do not interpolate.
  if (v1 === INT_MAX && v2 !== INT_MAX) return v2
  if (v2 === INT_MAX && v1 !== INT_MAX) return v1

  // Case 2: Both of the pixels are INT_MAX --> return INT_MAX
  // Case 3: Normal interpolation
  return v1 + (v2 - v1) * f;
}

function bufferStream(stream) {
  return new Promise((resolve, reject) => {
    const bufs = [];
    stream.on('data', (d) => {
      bufs.push(d);
    });
    stream.on('end', () => {
      console.log("end")
      resolve(Buffer.concat(bufs));
    });
    stream.on('error', (err) => {
      console.log("error")
      reject(err);
    });
  });
}

class HGT {
  constructor(buffer, swLatLng, options) {
    this._buffer = buffer;
    this._swLatLng = swLatLng;

    this.options = Object.assign(
      {},
      {
        interpolation: HGT.bilinear,
      },
      options,
    );

    if (buffer.length === 12967201 * 2) {
      this._resolution = 1;
      this._size = 3601;
    } else if (buffer.length === 1442401 * 2) {
      this._resolution = 3;
      this._size = 1201;
    } else {
      throw new Error('Unknown tile format (1 arcsecond and 3 arcsecond supported).');
    }
  }

  static async loadFile(path, swLatLng, options) {
    const buffer = await asyncReadFile(path);
    return new HGT(buffer, swLatLng, options);
  }

  static async loadStream(stream, swLatLng, options) {
    const buffer = await bufferStream(stream);
    return new HGT(buffer, swLatLng, options);
  }

  static nearestNeighbour(row, col) {
    return this._rowCol(Math.round(row), Math.round(col));
  }

  // Low-resolution interpolation, worst case solution...
  // Average the valid neighbors (maximum: 8 points).
  // Visualization: '*' is invalid; so, use neighbor points 'o'
  // o o o
  // o * o
  // o o o
  static avg_8pt(row, col) {
    // Closest integer point
    const x = Math.round(row);
    const y = Math.round(col);

    console.error(`Warning: falling back to avg_8pt(); Rounded: (${x}, ${y})`)

    const coords = [
      [[x-1, y-1], [x, y-1], [x+1, y-1]],
      [[x-1, y], [x, y], [x+1, y]],
      [[x-1, y+1], [x, y+1], [x+1, y+1]]
    ]
    console.error(coords)

    const values = coords.map(row => {
      return row.map(col => {
        const [a, b] = col
        return this._rowCol(a, b)
      })
    })
    console.error(values)

    const valid = values.flat().filter(x => x !== INT_MAX)
    const avg = valid.reduce((a, b) => a + b, 0) / valid.length
    console.error({avg, valid})
    console.error("")

    if (isNaN(avg)) throw Error('avg is NaN')

    return avg
  }

  static bilinear(row, col) {
    const rowLow = Math.floor(row);
    const rowHi = rowLow + 1;
    const rowFrac = row - rowLow;
    const colLow = Math.floor(col);
    const colHi = colLow + 1;
    const colFrac = col - colLow;
    const v00 = this._rowCol(rowLow, colLow);
    const v10 = this._rowCol(rowLow, colHi);
    const v11 = this._rowCol(rowHi, colHi);
    const v01 = this._rowCol(rowHi, colLow);
    const v1 = avg(v00, v10, colFrac);
    const v2 = avg(v01, v11, colFrac);
    const vfinal = avg(v1, v2, rowFrac);

    /*
    console.log("\n")
    console.log('row = ' + row);
    console.log('col = ' + col);
    console.log('rowLow = ' + rowLow);
    console.log('rowHi = ' + rowHi);
    console.log('rowFrac = ' + rowFrac);
    console.log('colLow = ' + colLow);
    console.log('colHi = ' + colHi);
    console.log('colFrac = ' + colFrac);
    console.log('v00 = ' + v00);
    console.log('v10 = ' + v10);
    console.log('v11 = ' + v11);
    console.log('v01 = ' + v01);
    console.log('v1 = ' + v1);
    console.log('v2 = ' + v2);
    console.log('--> vfinal = ' + vfinal);
    */

    if (vfinal !== 32767) return vfinal

    // Bilinear interpolation failed, so we fallback to avg_8pt()
    console.error(`Lossy bilinear failed. No valid pixels in quadrant. (${row},${col})`)
    return HGT.avg_8pt.call(this, row, col)
  }

  getElevation(latLng) {
    const size = this._size - 1;
    const ll = latLng;
    const row = (ll[0] - this._swLatLng[0]) * size;
    const col = (ll[1] - this._swLatLng[1]) * size;

    if (row < 0 || col < 0 || row > size || col > size) {
      throw new Error(
        'Latitude/longitude is outside tile bounds (row=' + row + ', col=' + col + '; size=' + size,
      );
    }

    return this.options.interpolation.call(this, row, col);
  }

  _rowCol(row, col) {
    const size = this._size;
    const offset = ((size - row - 1) * size + col) * 2;

    return this._buffer.readInt16BE(offset);
  }
}

module.exports = HGT;
