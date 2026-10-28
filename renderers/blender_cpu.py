"""Version 1 evaluated meshes. JS owns skinning, morphs, timing and choreography.
Coordinates stay Y-up in Blender world. Camera local -Z/+Y matches Three.js.
No display, browser, HTTP server, GPU device or denoiser is required.
"""
import bpy, sys, os, json, math, struct, hashlib
from mathutils import Matrix
job_dir = sys.argv[sys.argv.index('--')+1]
with open(os.path.join(job_dir, 'scene.json')) as f: job=json.load(f)
if job['version'] != 1 or job['kind'] != 'goosnav-evaluated-scene': raise ValueError('Unsupported CPU job version')
bpy.ops.wm.read_factory_settings(use_empty=True)
scene=bpy.context.scene
scene.render.engine='CYCLES'; scene.cycles.device='CPU'; scene.cycles.samples=int(os.environ.get('THEATRE_CPU_SAMPLES','8'))
scene.cycles.use_denoising=False
scene.render.threads_mode='FIXED'; scene.render.threads=int(os.environ.get('THEATRE_CPU_THREADS','4'))
scene.render.resolution_x=job['timeline']['width']; scene.render.resolution_y=job['timeline']['height']; scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'; scene.render.film_transparent=False
scene.view_settings.view_transform='AgX'
scene.world=bpy.data.worlds.new('World'); scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.16,.20,.18,1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value=.6
materials=[]
for definition in job['materials']:
    m=bpy.data.materials.new('Material'); m.use_nodes=True
    nodes=m.node_tree.nodes; links=m.node_tree.links; bs=nodes.get('Principled BSDF')
    color=(*definition['color'],1); bs.inputs['Base Color'].default_value=color
    bs.inputs['Roughness'].default_value=definition['roughness'];bs.inputs['Metallic'].default_value=definition['metalness']
    bs.inputs['Alpha'].default_value=definition['alpha']
    if definition['emission']:
        bs.inputs['Emission Color'].default_value=color;bs.inputs['Emission Strength'].default_value=1
    if definition.get('texture'):
        texture=nodes.new('ShaderNodeTexImage');texture.image=bpy.data.images.load(os.path.join(job_dir,definition['texture']))
        links.new(texture.outputs['Color'],bs.inputs['Emission Color' if definition['emission'] else 'Base Color'])
    materials.append(m)
objects=[]
for definition in job['meshes']:
    mesh=bpy.data.meshes.new(definition['name']); p=definition['positions']; ind=definition['indices']
    mesh.from_pydata(list(zip(p[::3],p[1::3],p[2::3])),[],list(zip(ind[::3],ind[1::3],ind[2::3])))
    mesh.materials.append(materials[definition['material']])
    if definition['uv']:
        layer=mesh.uv_layers.new(); uv=definition['uv'];flip=not job['materials'][definition['material']]['flipY']
        for loop in mesh.loops:
            i=loop.vertex_index*2;layer.data[loop.index].uv=(uv[i],1-uv[i+1] if flip else uv[i+1])
    for poly in mesh.polygons:poly.use_smooth=True
    o=bpy.data.objects.new(definition['name'],mesh);scene.collection.objects.link(o);objects.append(o)
def matrix(values):return Matrix([values[i::4] for i in range(4)])
cam=bpy.data.cameras.new('Camera');camera=bpy.data.objects.new('Camera',cam);scene.collection.objects.link(camera);scene.camera=camera
# Vertical field of view is explicit, including portrait output.
cam.sensor_fit='VERTICAL';cam.sensor_height=24
from mathutils import Vector
for position,power,color in [((-2.5,4,3),600,(1,.84,.65)),((2,2,2),350,(.72,.86,1)),((0,3,-2),450,(1,.65,.35))]:
    light=bpy.data.lights.new('Key','AREA');light.energy=power;light.color=color;light.shape='DISK';light.size=4
    o=bpy.data.objects.new('Key',light);scene.collection.objects.link(o);o.location=position;o.rotation_euler=(Vector((0,1,0))-o.location).to_track_quat('-Z','Y').to_euler()
for f,frame in enumerate(job['frames']):
    target=os.path.join(job_dir,'render-%06d.png'%f)
    if frame['full']:continue
    receipt=target+'.json'
    if os.path.exists(target) and os.path.exists(receipt):
        with open(receipt) as r: old=json.load(r)
        with open(target,'rb') as r: digest=hashlib.sha256(r.read()).hexdigest()
        if old.get('inputKey')==job['inputKey'] and old.get('sha256')==digest:continue
    with open(os.path.join(job_dir,'vertices-%06d.bin'%f),'rb') as r: raw=r.read()
    if hashlib.sha256(raw).hexdigest()!=frame['sha256']:raise ValueError('CPU frame integrity failure')
    offset=0
    for o,definition,state in zip(objects,job['meshes'],frame['objects']):
        o.matrix_world=matrix(state['matrix']);o.hide_render=not state['visible']
        if definition['dynamic']:
            count=len(definition['positions']);values=struct.unpack_from('<%df'%count,raw,offset);offset+=count*4
            o.data.vertices.foreach_set('co',values);o.data.update()
    camera.matrix_world=matrix(frame['camera']['matrix']);cam.lens=cam.sensor_height/(2*math.tan(math.radians(frame['camera']['fov'])/2));cam.clip_start=frame['camera']['near'];cam.clip_end=frame['camera']['far']
    scene.render.filepath=target+'.partial.png';bpy.ops.render.render(write_still=True)
    os.replace(scene.render.filepath,target)
    with open(target,'rb') as r:digest=hashlib.sha256(r.read()).hexdigest()
    with open(receipt,'w') as r:json.dump({'inputKey':job['inputKey'],'sha256':digest},r)
    print('CPU_FRAME',f,flush=True)
