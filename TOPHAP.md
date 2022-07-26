# CHANGELOG

## 0.0.1 (2022-07-21)
* Original fork

## 0.1.1 (2022-07-21)
* Add constructor with s3 base url param
* Add constructor with s3 bucket + prefix param instead.
* Use aws-sdk instead of https to get files. Keeps our bucket private.
* S3 maxRetries=25 (prev. default was 3)
* wrap S3 retry with node-promise-retry

## 0.2.0 (2022-08-08)
* Add .cache/elevation folder.
* Only fetch from S3 when file is not available locally.

## 0.2.1 (2022-08-11)
* Log s3 retry error
* Fix fs.exists check

## 0.2.2 (2022-08-12)
* Fix log only on error for S3 download.

## 0.2.3 (2022-09-07)
* Filter out height=32,767 from interpolation function.

## 0.2.4 (2022-09-12)
* Add avg_8pt() method as a fallback for when all four points of the
  interpolation quadrant are INT_MAX. Instead, we average the surrounding
  (valid) eight neighbor points>

## 0.2.5 (2022-09-12)
* Change avg_8pt() to avg_neighbor() with optional radius parameter. This
  allows the use of pixel rings of radius=1 and radius=2. Radius=1 will average
  8 neighbors. Radious=2 will average 24 neighbors.
