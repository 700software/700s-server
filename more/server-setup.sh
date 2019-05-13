
### RESOLVE syspool volume tagging mismatch ###

zpool status # see the device is c4t0d0
sudo format # see the device is c1t0d0. This is mismatched
^C # Ctrl+C
# beadm activate will fail and significant pkg updates resulting in "Create boot environment: Yes" will not be possible

# this is fixed with instructions from https://omniosce.org/ml-archive/2018-July/009651.html
# the issue is that the zpool thinks its c4, but as you can see in sudo format, it's coming out as c1
# • First create additional Volume of the same size within the EC2 Console on AWS
# • Attach the volume to the same Instance. Device defaults to /dev/sdf
zpool attach syspool c4t0d0 c1t5d0
zpool status # wait for resilver to complete
zpool detach syspool c4t0d0 # because it's mislabeled
zpool attach syspool c1t5d0 c1t0d0 # reattach same volume, now using correct name (matching sudo format)
zpool detach syspool c1t5d0
# • Now you can detach and delete that volume from EC2

### UPDATE packages ###

pkg install pkg # might be needed before pkg update works
pkg update

# now, if it says if it shows "Create boot environment: Yes", then
beadm list # verify that the new boot environment is active
#beadm activate omnios-1 # activate it if it is not already
# If you get "Unable to activate omnios-1." "Error installing boot files." then the RESOLVE was not correctly completed above

reboot # you can try -f (fast) option but I tend to think it doesn't work on AWS

### UPGRADE to latest stable release ###
# visit https://omniosce.org/upgrade to ensure that you can upgrade to the version you desire, and that it is not too big a jump over multiple versions
# [Backup any data as needed first!]
pkg set-publisher -r -O https://pkg.omniosce.org/r151030/core omnios
pkg set-publisher -r -O https://pkg.omniosce.org/r151030/extra extra.omnios
pkg update -f -r --be-name=r151030
reboot

### CUSTOMIZATION ###

echo "\n# Below lines added by us:\n\numask 027\nPATH=/700s/sys/bin:/opt/local/sbin:/opt/local/bin:/usr/gnu/bin:/usr/bin:/usr/sbin:/sbin\nMANPATH=/opt/local/man:/usr/share/man\n\nexport LANG=en_US.UTF-8\n\nexport PS1=\"\u@\h:\w\\\\\\$ \"\n\nalias beep='echo -en \\\\\\\\a'\nalias ls='ls --color'\nalias grep='grep --color'\nalias l='ls -lh'\n\ncomplete -d cd" >> /etc/profile
exit
# login again
echo "#"'!'"/usr/bin/sh\ncase \"\$1\" in\n'start')\n\t/700s/sys/env /700s/sys/start/all\n\t;;\n'stop')\n\t/700s/sys/env /700s/sys/stop/all\n\t;;\n*)\n\techo \"Usage: \$0 { start | stop }\"\n\texit 1\n\t;;\nesac\nexit 0" > /etc/rc3.d/S700s
chmod u+x /etc/rc3.d/S700s; chgrp staff /etc/rc3.d/S700s
ln -s ../rc3.d/S700s /etc/rc0.d/K700s
(grep '#' /etc/auto_master; echo; echo "## Lines removed by us"; grep -v '#' /etc/auto_master | sed 's/^/#/') > /etc/auto_master.new; cat /etc/auto_master.new > /etc/auto_master; rm /etc/auto_master.new
svcadm disable -s autofs; svcadm enable -s autofs; svcadm disable -s autofs # ignore warnings
zfs create -o mountpoint=/home -o compress=on -o dedup=on syspool/home
rmdir /net
chgrp staff /home
chmod g+s,o= /home
useradd -D -g 10 -s /usr/bin/bash # sets default settings for user accounts
echo "\n# Below lines added by us:\n%sudoers ALL=(ALL) ALL" >> /etc/sudoers
groupadd -g 100 sudoers
groupadd -g 101 700s
usermod -G 700s webservd

### USER creation ###
useradd -u 100 -G sudoers,700s bryan # create your own user with the id consistent with the other servers, if any
mkdir /home/bryan; chown bryan:staff /home/bryan

passwd bryan # this is quite important, since bryan is the only sudoer right now
sudo -u bryan sudo passwd -N root # this command will test sudo works and then remove the root password (requiring us to use sudo)

# note that ssh key access is still possible to access root login!
# keep this safely secured, or remove the key association from server
 
### MORE CUSTOMIZATION ###

svcadm disable sendmail # enabled later when configured
svcadm disable sendmail-client
svcadm disable ndp # this one doesn't persist across reboot for some reason, I think some others are like this as well
svcadm disable zones
svcadm disable ktkt_warn
svcadm disable metainit
svcadm disable gss
svcadm disable rpc/bind
svcadm disable smserver # used in CDE (desktop) for managing removable devices
svcadm disable group:default # best I can tell, used for SAMBA, related to network shared folders
svcadm disable group:zfs
svcadm disable sac
svcadm disable metasync
svcadm disable dbus
svcadm disable hal
svcadm disable fcoe_initiator
svcadm disable ipsecalgs
svcadm disable ipsec/policy
svcadm disable zones-monitoring
svcadm disable resource-mgmt
svcadm disable iscsi/initiator
svcadm disable rpc/bind # for security, close TCP port sunrpc
svcadm disable iptun
svcadm disable routing/route # for security, close TCP port 520 (route)
mv /etc/rc2.d/S81dodatadm.udaplt /etc/rc2.d/s81dodatadm.udaplt
pkg change-facet --no-backup-be facet.locale.de=false facet.locale.de_DE=false facet.locale.es=false facet.locale.es_ES=false facet.locale.fr=false facet.locale.fr_FR=false facet.locale.it=false facet.locale.it_IT=false facet.locale.ja=false facet.locale.ja_*=false facet.locale.ko=false facet.locale.ko_*=false facet.locale.pt=false facet.locale.pt_BR=false facet.locale.zh=false facet.locale.zh_CN=false facet.locale.zh_TW=false # reduces disk usage by 0.11G, requires internet connection to work
pkg install gnu-tar
pkg install git
sudo git config --global --edit # set default name and email for commits done as root

chmod g+w /etc/motd; sudo chgrp staff /etc/motd

zfs create -o mountpoint=/opt/local syspool/opt-local
cd /tmp; curl -O https://pkgsrc.joyent.com/packages/SmartOS/bootstrap/bootstrap-trunk-x86_64-20190317.tar.gz
cd /; tar -zxpf /tmp/bootstrap-trunk-x86_64-20190317.tar.gz
mkdir /opt/local/var /opt/local/var/db
mv /var/db/pkgin /opt/local/var/db
ln -s ../../opt/local/var/db/pkgin /var/db

pkgin install nodejs

### PRIMARY directory /700s ###

zfs create -o mountpoint=/700s -o aclinherit=passthrough -o snapdir=visible -o dedup=on syspool/700s
chmod g=rx,o= /700s; chgrp 700s /700s
zfs set mountpoint=none syspool/700s
zfs create -o mountpoint=/700s syspool/700s/main
zfs create -o dedup=off -o mountpoint=/700s/log syspool/700s/log
zfs create -o mountpoint=/700s/space syspool/700s/space
mkdir /700s/more /700s/svc /700s/sys /700s/var /700s/web
chgrp staff /700s/log /700s/svc /700s/sys /700s/web /700s/var /700s/space /700s/opt /700s/more
chgrp staff /700s/more; chmod g+s /700s/more; chmod+660 /700s/more
chmod u=rwx,g=rxs,o=x /700s/sys /700s/log /700s/var /700s/svc /700s/var
mkdir /700s/sys/start /700s/sys/stop /700s/sys/bin
chmod o+x /700s/sys/bin
chmod g+s /700s/web
chmod+664- /700s/web
chmod+660 /700s/space

cd /700s
git init
git remote add origin https://github.com/musicw/700s-server.git
git pull https://github.com/musicw/700s-server.git master

chgrp staff .gitignore
chmod a+rx  /700s/sys/env
chmod o+x /700s/svc/webserv /700s/svc/webserv/bin /700s/svc/webserv/lib
chmod o+rx /700s/svc/webserv/bin/* /700s/svc/webserv/lib/*
