#!/bin/bash

# sed -i '1i\package com.github.markus_wa.demoinfocs_golang;\n' proto/*.proto
# sed -i 's/ \.(?!google)/ com.github.markus_wa.demoinfocs_golang./g' proto/*.proto

protoc -Iproto \
       --go_out=. \
       --go_opt=Mcstrike15_usermessages.proto=github.com/bugkingzht/cs-demobox/pkg/demoinfocs/msg \
       --go_opt=Mcstrike15_gcmessages.proto=github.com/bugkingzht/cs-demobox/pkg/demoinfocs/msg \
       --go_opt=Mengine_gcmessages.proto=github.com/bugkingzht/cs-demobox/pkg/demoinfocs/msg \
       --go_opt=Mnetmessages.proto=github.com/bugkingzht/cs-demobox/pkg/demoinfocs/msg \
       --go_opt=Msteammessages.proto=github.com/bugkingzht/cs-demobox/pkg/demoinfocs/msg \
       --go_opt=Mgcsdk_gcmessages.proto=github.com/bugkingzht/cs-demobox/pkg/demoinfocs/msg \
       --go_opt=Mnetworkbasetypes.proto=github.com/bugkingzht/cs-demobox/pkg/demoinfocs/msg \
       --go_opt=Mnetwork_connection.proto=github.com/bugkingzht/cs-demobox/pkg/demoinfocs/msg \
       --go_opt=Mdemo.proto=github.com/bugkingzht/cs-demobox/pkg/demoinfocs/msg \
       --go_opt=Mgameevents.proto=github.com/bugkingzht/cs-demobox/pkg/demoinfocs/msg \
       --go_opt=Musermessages.proto=github.com/bugkingzht/cs-demobox/pkg/demoinfocs/msg \
       --go_opt=Mcs_gameevents.proto=github.com/bugkingzht/cs-demobox/pkg/demoinfocs/msg \
       --go_opt=Mte.proto=github.com/bugkingzht/cs-demobox/pkg/demoinfocs/msg \
       --go_opt=module=github.com/bugkingzht/cs-demobox/pkg/demoinfocs/msg \
       cstrike15_gcmessages.proto \
       cstrike15_usermessages.proto \
       engine_gcmessages.proto \
       netmessages.proto \
       steammessages.proto \
       gcsdk_gcmessages.proto \
       networkbasetypes.proto \
       network_connection.proto \
       demo.proto \
       gameevents.proto \
       usermessages.proto \
       cs_gameevents.proto \
       te.proto
