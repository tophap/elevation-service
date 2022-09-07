const fs = require('fs')
const path = require('path');
const crypto = require('crypto')
const memoize = require('memoizee');
const aws = require('aws-sdk')
const { readFile } = require('fs/promises');
const { promisify } = require('util');
const Zlib = require('zlib');
const promiseRetry = require('promise-retry');

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
    const body = await readFile(path.join(this._folder, this.getFilePath(lat, lng)));
    const buffer = await this.optionalGunzip(body)
    const tile = new HGT(buffer, [lat, lng]);
    return tile;
  }
}

class S3TileSet extends TileSet {
  constructor(options, s3Options) {
    super(options);
    this.s3Bucket = s3Options.bucket
    this.s3Prefix = s3Options.prefix

    this.s3 = new aws.S3({ maxRetries: 25 })
  }

  s3Get(path) {
    return new Promise((resolve, reject) => {
      const Key = `${this.s3Prefix}/${path}`
      const params = { Bucket: this.s3Bucket, Key }

      this.s3.getObject(params, (err, data) => {
        if (err) {
          console.error(err, err.stack)
          reject(err)
        }

        resolve(data.Body)
      })
    })
  }

  async s3Get_WithCache(path) {
    // local cache directory
    const prefix = '.cache/elevation'
    fs.promises.mkdir(prefix, {recursive: true})

    // determine local filename
    const md5 = crypto.createHash('md5').update(path, 'utf8').digest('hex')
    const localpath = `${prefix}/${md5}`

    // download file if needed
    if (!fs.existsSync(localpath)) {
      const body = await this.s3Get(path)
      await fs.promises.writeFile(localpath, body)
    }

    // return cached file
    return fs.promises.readFile(localpath)
  }

  async optionalGunzip(input) {
    if (this.options.gzip) {
        const raw = await promisify(Zlib.gunzip)(input)
        return Buffer.from(raw)
    } else {
      return input
    }
  }

  s3Get_WithRetry(path, enableCache = true) {
    return promiseRetry(async (retry, attempt) => {
      const fn = enableCache ? this.s3Get_WithCache : this.s3Get

      try {
        const body = await fn.call(this, path)
        return this.optionalGunzip(body)
      } catch (error) {
        console.error(error, path, attempt)
        retry(error)
      }
    })
  }

  async _getTile(lat, lng) {
    const tilepath = this.getFilePath(lat, lng)
    const buffer = await this.s3Get_WithRetry(tilepath)
    const tile = new HGT(buffer, [lat, lng]);
    return tile;
  }
}

TileSet.S3TileSet = S3TileSet;
TileSet.FileTileSet = FileTileSet;

module.exports = TileSet;
