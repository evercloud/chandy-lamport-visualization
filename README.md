# Chandy-Lamport Snapshot Visualizer

Simple standalone animation of the Chandy-Lamport distributed snapshot algorithm.

## Run

No setup is required.

Open `index.html` directly in your browser.

## What you will see

- 7 colored circles for processes (`P1` to `P7`)
- Fully connected network links between all processes
- Small yellow packets moving continuously as regular application traffic
- Snapshot can start manually (button) or automatically (random initiator)
- Red marker packets are sent on all outgoing channels and trigger chain recording
- Normal application messages keep flowing during snapshot collection
- Logical channels are directional and FIFO (`Pi -> Pj`)
- Snapshot ends only after each process has received a marker on every incoming channel
- A node returns to normal color independently when it closes all incoming channels

## Controls

- `Start Manual Snapshot`: starts one snapshot run immediately
- `Reset`: clears packets and restores the initial visual state immediately
