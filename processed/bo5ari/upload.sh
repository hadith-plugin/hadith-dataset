#!/bin/bash

for f in *
do
    curl -XPUT https://hadith-search.herokuapp.com/add/bokhari/$f -d @$f --header "Content-Type: application/json" -v
done

