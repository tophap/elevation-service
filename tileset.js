const path = require('path');
const fetch  = require('node-fetch');
const memoize = require('memoizee');
const aws = require('aws-sdk')
const { readFile } = require('fs/promises');
const { promisify } = require('util');
const { gunzip } = require('zlib');

const HGT = require('./hgt');

const DEFAULT_S3_BASE_URL = 'https://elevation-tiles-prod.s3.amazonaws.com/skadi';

class TileSet {
  constructor(options) {
    this.options = Object.assign(
      {},
      {
        cacheSize: 128,
        gzip: true,
      },
      options,
    );
    this.getTile = memoize(this._getTile.bind(this), {
      promise: true,
      length: 2,
      max: this.options.cacheSize,
    });
  }

  getFilePath(lat, lng) {
    const latFileName = `${lat < 0 ? 'S' : 'N'}${String(Math.abs(lat)).padStart(2, '0')}`;
    const lngFileName = `${lng < 0 ? 'W' : 'E'}${String(Math.abs(lng)).padStart(3, '0')}`;
    const fileName = `${latFileName}${lngFileName}.hgt.gz`;
    return `${latFileName}/${fileName}`;
  }

  async getElevation(latLng) {
    const tile = await this.getTile(Math.floor(latLng[0]), Math.floor(latLng[1]));
    return tile.getElevation(latLng);
  }
}

class FileTileSet extends TileSet {
  constructor(folder, options) {
    super(options);
    this._folder = folder;
  }

  async _getTile(lat, lng) {
    let buffer = await readFile(path.join(this._folder, this.getFilePath(lat, lng)));
    if (this.options.gzip) {
      buffer = await promisify(gunzip)(buffer);
    }
    const tile = new HGT(buffer, [lat, lng]);
    return tile;
  }
}

class S3TileSet extends TileSet {
  constructor(options, s3Options) {
    super(options);
    this.s3Bucket = s3Options.bucket
    this.s3Prefix = s3Options.prefix

    this.s3 = new aws.S3({maxRetries: 25})
  }

  s3Get(path) {
    return new Promise((resolve, reject) => {
      const Key = `${this.s3Prefix}/${path}`
      const params = {Bucket: this.s3Bucket, Key}

      this.s3.getObject(params, (err, data) => {
        console.error(params)
        if (err) {
          console.error(err, err.stack)
          reject(err)
        }

        resolve(data.Body)
      })
    })
  }

  async _getTile(lat, lng) {
    // console.error(`${this.getFilePath(lat, lng)}`);
    let buffer = await this.s3Get(`${this.getFilePath(lat, lng)}`)
    if (this.options.gzip) {
      buffer = Buffer.from(await promisify(gunzip)(buffer));
    }
    const tile = new HGT(buffer, [lat, lng]);
    return tile;
  }
}

TileSet.S3TileSet = S3TileSet;
TileSet.FileTileSet = FileTileSet;

module.exports = TileSet;
