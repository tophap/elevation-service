# CHANGELOG

## 0.0.1 (2022-07-21)
* Original fork

## 0.1.0 (2022-07-21)
* Add constructor with s3 base url param
* Add constructor with s3 bucket + prefix param instead.
* Use aws-sdk instead of https to get files. Keeps our bucket private.
* S3 maxRetries=25 (prev. default was 3)
* wrap S3 retry with node-promise-retry
