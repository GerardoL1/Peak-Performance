#!/bin/sh
# Creates the least-privilege user the API connects as (first start only).
mysql -uroot -p"$MYSQL_ROOT_PASSWORD" <<SQL
CREATE USER 'peak_app'@'%' IDENTIFIED BY '${DB_PASSWORD}';
GRANT SELECT, INSERT, UPDATE, DELETE ON peakperformance.* TO 'peak_app'@'%';
SQL
