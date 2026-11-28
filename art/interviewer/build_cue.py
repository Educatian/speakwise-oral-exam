"""Build Cue, its animation and the web assets with Blender 5.0.1 / bpy."""
from math import atan2, cos, sin, pi, exp, radians, sqrt, tan
from pathlib import Path

import bpy
import numpy as np
import runpy
from mathutils import Matrix, Quaternion, Vector

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'public' / 'interviewer'
OUT.mkdir(exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.fps = 24
scene.frame_end = 1530
scene.render.engine = 'CYCLES'
scene.cycles.samples = 64
scene.cycles.use_denoising = True
scene.render.film_transparent = True
scene.render.resolution_x, scene.render.resolution_y = 960, 840
scene.render.resolution_percentage = 100
scene.world = bpy.data.worlds.new('Studio fill')
scene.world.color = (.25, .25, .25)


def material(name, hex_color, rough=.65):
    rgb = [int(hex_color[i:i+2], 16) / 255 for i in (0, 2, 4)]
    color = tuple(((v + .055) / 1.055) ** 2.4 if v > .04045 else v / 12.92 for v in rgb) + (1,)
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = color
    mat.use_nodes = True
    bsdf = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Base Color'].default_value = color
    bsdf.inputs['Roughness'].default_value = rough
    return mat


glove = material('Ivory glove leather', 'E7CDA2')
shell = material('Honey lacquer', 'DB9762', .31)
skin = material('Apricot face', 'EBAE7F', .48)
hair = material('Matte chestnut crop', '493C38', .88)
inner_lip = material('Inner lip', 'BE725C', .53)
inlay = material('Oxide enamel', '2C4546', .36)
umber = material('Espresso', '4B302F')
lip = material('Copper lip', 'A8674D', .37)
white = material('Ivory sclera', 'FFF2DC', .27)
iris = material('Petrol blue iris', '4F8881', .28)
pupil = material('Deep pupil', '241C23', .19)
glint = material('Eye glint', 'FFFAEA', .22)
jacket = material('Lagoon twill', '286D71')
trim = material('Collar shadow', '194C51')
shirt = material('Oatmeal knit', 'E8CCA4')
chambray = material('Slate chambray', '678487', .87)
brass = material('Amber enamel', 'EDAE54', .34)
silk = material('Paprika silk', 'C65C46', .40)
for mat,metal,coat,sheen in [(shell,.36,.22,0),(brass,.64,.21,0),(inlay,.42,.19,0),
                            (skin,0,.04,0),(jacket,0,0,.38),(silk,0,.14,.38),(hair,0,0,.12)]:
    bsdf=mat.node_tree.nodes.get('Principled BSDF')
    for name,value in [('Metallic',metal),('Coat Weight',coat),('Sheen Weight',sheen)]:
        bsdf.inputs[name].default_value=value


def twill_normal(mat):
    y,x=np.mgrid[:256,:256]*2*pi/256
    height=.48*np.sin(40*x+16*y)+.22*np.cos(32*y-8*x)
    dx=(np.roll(height,-1,1)-np.roll(height,1,1))*.24
    dy=(np.roll(height,-1,0)-np.roll(height,1,0))*.24
    z=1/np.sqrt(1+dx*dx+dy*dy)
    pixels=np.stack((.5-.5*dx*z,.5-.5*dy*z,.5+.5*z,np.ones_like(z)),axis=2)
    texture=bpy.data.images.new('Woven twill normal',width=256,height=256)
    texture.colorspace_settings.name='Non-Color'
    texture.pixels.foreach_set(pixels.astype('float32').ravel())
    texture.pack()
    nodes=mat.node_tree.nodes
    image=nodes.new('ShaderNodeTexImage')
    image.image=texture
    normal=nodes.new('ShaderNodeNormalMap')
    normal.inputs['Strength'].default_value=.22
    mat.node_tree.links.new(image.outputs['Color'],normal.inputs['Color'])
    mat.node_tree.links.new(normal.outputs['Normal'],nodes.get('Principled BSDF').inputs['Normal'])


twill_normal(jacket)


def pivot(name, loc, parent=None):
    ob = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(ob)
    ob.parent, ob.location = parent, loc
    ob.empty_display_size = .045
    return ob


def finish(ob, name, mat, parent):
    ob.name, ob.parent = name, parent
    ob.data.materials.append(mat)
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob


def oval(name, pos, size, mat, parent, tilt=0):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=28, ring_count=18)
    ob = finish(bpy.context.object, name, mat, parent)
    ob.location, ob.scale = pos, size
    ob.rotation_euler.y = radians(tilt)
    return ob


def sculpt(name, rows, mat, parent, contour=None):
    # Subdivided elliptical cross sections allow cheeks, shoulders and jaw to taper.
    n = 96 if contour else 32
    if contour:
        # Sample the nose and mouth before subdivision; they belong to the face surface.
        samples=[]
        for lower,upper in zip(rows,rows[1:]):
            steps=max(1,round((upper[0]-lower[0])/.028))
            for j in range(steps):
                samples.append(tuple(a+(b-a)*j/steps for a,b in zip(lower,upper)))
        rows=[*samples,rows[-1]]
    vs = [(rx*cos(i*2*pi/n), y+ry*sin(i*2*pi/n), z) for z, rx, ry, y in rows for i in range(n)]
    if contour:
        vs = [(x,y-contour(x,z)*max(0,-sin((i%n)*2*pi/n))**3,z) for i,(x,y,z) in enumerate(vs)]
    fs = [(j*n+i, j*n+(i+1)%n, (j+1)*n+(i+1)%n, (j+1)*n+i)
          for j in range(len(rows)-1) for i in range(n)]
    fs += [tuple(reversed(range(n))), tuple(range(len(vs)-n,len(vs)))]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vs, [], fs)
    if mat == jacket:
        uv=mesh.uv_layers.new(name='Tailoring UV')
        for face in mesh.polygons[:(len(rows)-1)*n]:
            row,column=divmod(face.index,n)
            for loop,(a,b) in zip(face.loop_indices,[(0,0),(1,0),(1,1),(0,1)]):
                uv.data[loop].uv=((column+a)/n,(row+b)/(len(rows)-1))
    ob = bpy.data.objects.new(name,mesh)
    bpy.context.collection.objects.link(ob)
    finish(ob,name,mat,parent)
    mod = ob.modifiers.new('Soft silhouette','SUBSURF')
    mod.levels = mod.render_levels = 2
    return ob


def sweep(name, sections, mat, parent):
    # Elliptical sections along the horizontal axis taper into a single silhouette.
    rings = [(x,y+depth*cos(2*pi*i/20),z+height*sin(2*pi*i/20))
             for x,y,z,depth,height in sections for i in range(20)]
    faces = [(r*20+i,r*20+(i+1)%20,(r+1)*20+(i+1)%20,(r+1)*20+i)
             for r in range(len(sections)-1) for i in range(20)]
    faces += [tuple(reversed(range(20))),tuple(range(len(rings)-20,len(rings)))]
    mesh=bpy.data.meshes.new(name)
    mesh.from_pydata(rings,[],faces)
    ob=bpy.data.objects.new(name,mesh)
    bpy.context.collection.objects.link(ob)
    finish(ob,name,mat,parent)
    smooth=ob.modifiers.new('Sculpted surface','SUBSURF')
    smooth.levels=smooth.render_levels=2
    return ob


def cloth_panel(name, points, mat, parent):
    mesh=bpy.data.meshes.new(name)
    mesh.from_pydata(points,[],[tuple(range(len(points)))])
    ob=bpy.data.objects.new(name,mesh)
    bpy.context.collection.objects.link(ob)
    finish(ob,name,mat,parent)
    solid=ob.modifiers.new('Hem','SOLIDIFY')
    solid.thickness=.019
    bevel=ob.modifiers.new('Rolled edge','BEVEL')
    bevel.width,bevel.segments=.016,3
    return ob


def stroke(name, points, radii, mat, parent):
    path = bpy.data.curves.new(name,'CURVE')
    path.dimensions, path.resolution_u = '3D', 8
    path.bevel_depth, path.bevel_resolution, path.use_fill_caps = 1, 3, True
    spline = path.splines.new('BEZIER')
    spline.bezier_points.add(len(points)-1)
    for knot, pos, radius in zip(spline.bezier_points,points,radii):
        knot.co, knot.radius = pos,radius
        knot.handle_left_type = knot.handle_right_type = 'AUTO'
    ob = bpy.data.objects.new(name,path)
    bpy.context.collection.objects.link(ob)
    ob.parent = parent
    path.materials.append(mat)
    return ob


def link(name, start, end, width, depth, mat, parent):
    a,b = Vector(start),Vector(end)
    ob = oval(name,(a+b)/2,(width,depth,(b-a).length/2+width*.48),mat,parent)
    ob.rotation_euler = (b-a).to_track_quat('Z','Y').to_euler()
    return ob


def sleeve(name, start, end, width, depth, mat, parent):
    a,b=Vector(start),Vector(end)
    length=(b-a).length
    profile=[(-.08,.48),(-.025,.87),(.12,1.0),(.45,.96),(.80,.82),(1,.73),(1.06,.40)]
    ob=sculpt(name,[(t*length,width*r,depth*r,0) for t,r in profile],mat,parent)
    ob.location=a
    ob.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler()
    return ob


chest = pivot('Breath',(0,0,.05))
sculpt('Tailored jacket',[(0,.43,.31,0),(.08,.64,.37,0),(.48,.71,.45,0),(.9,.79,.45,0),(1.12,.65,.37,0),(1.22,.3,.28,0)],jacket,chest)
sculpt('Neck',[(1.12,.18,.16,0),(1.2,.22,.19,-.02),(1.39,.24,.19,-.03)],skin,chest)
cloth_panel('Chambray shirt opening',[(-.19,-.32,1.23),(0,-.412,1.13),(.19,-.32,1.23),
            (.18,-.429,1.04),(.012,-.463,.86),(-.19,-.431,1.04)],chambray,chest)
for side in [-1,1]:
    s=side
    cloth_panel('Overshirt collar',[(s*.14,-.362,1.22),(s*.28,-.30,1.245),
                (s*.38,-.38,1.06),(s*.205,-.441,1.105)],trim,chest)
stroke('Breast pocket welt',[(.29,-.438,.77),(.41,-.397,.79),(.55,-.315,.82)],[.013,.017,.012],trim,chest)
stroke('Jacket placket',[(0,-.45,.74),(0,-.44,.5),(0,-.38,.08)],[.012,.013,.009],trim,chest)
for z in (.52,.29):
    oval('Corozo button',(.045,-.446,z),(.033,.016,.033),brass,chest)
head = pivot('Head',(0,-.02,1.26),chest)
# A single face surface flows from the chin through the cheeks to the hairline.
cheeks, speech_shape = runpy.run_path(str(Path(__file__).with_name('face_surface.py')))['build_face'](
    head, skin, umber, hair)
for side in (-1,1):
    oval('Swivel housing',(side*.652,0,.64),(.104,.16,.184),trim,head)
    oval('Swivel screw',(side*.722,-.052,.65),(.067,.123,.116),brass,head)
    for h in (-.055,0,.055):
        stroke('Earpiece grille',[(side*.723,-.150,.67+h),(side*.753,-.152,.66+h),
               (side*.77,-.126,.642+h)],[.006,.011,.004],inlay,head)
    stroke('Suspension yoke',[(side*.747,0,.63),(side*.732,.027,.34),
        (side*.55,.01,.12),(side*.24,.018,.045)],[.043,.043,.047,.053],brass,head)

gazes = []
upper_lids = []
brows = []
for s in [-1,1]:
    eye = pivot('Blink_'+str(s),(s*.236,-.446,.79+s*.008),head)
    eye.scale=(.98,.76,.89)
    oval('Eye surround',(0,.016,.002),(.210,.108,.208),inner_lip,eye)
    oval('Eye white',(0,-.015,0),(.201,.118,.201),white,eye)
    gaze = pivot('Gaze '+str(s),(0,0,0),eye)
    gazes.append(gaze)
    oval('Iris',(-s*.020,-.123,-.006),(.128,.036,.146),iris,gaze)
    oval('Pupil',(-s*.022,-.150,-.008),(.083,.022,.108),pupil,gaze)
    oval('Studio reflection',(-s*.022-.035,-.168,.047),(.020,.007,.022),glint,gaze)
    # Rotate a cap inside an ellipsoidal socket so the iris keeps its shape.
    socket = pivot('Lid socket '+str(s),(0,-.009,.002),eye)
    socket.scale = (.211,.205,.212)
    lid = pivot('Upper lid '+str(s),(0,0,0),socket)
    rows = [(1,.001,.001,0)]
    for ring in range(1,10):
        theta = radians(87 * ring / 9)
        rows.append((cos(theta),sin(theta),sin(theta),0))
    sculpt('Upper eyelid',list(reversed(rows)),skin,lid)
    stroke('Lower lid',[(-s*.19,-.065,-.045),(-s*.13,-.124,-.14),
           (s*.015,-.139,-.17),(s*.135,-.11,-.133),(s*.197,-.051,-.028)],
           [.006,.018,.021,.016,.004],skin,eye)
    upper_lids.append((s,lid))
    brow=pivot('Brow hinge '+str(s),(s*.244,-.489,1.001),head)
    stroke('Arched brow',[(-s*.155,-.029,-.010),(s*.005,-.038,.018),
           (s*.091,-.025,.018),(s*.161,.005,-.004)],[.023,.045,.035,.006],hair,brow)
    brows.append((s,brow))
runpy.run_path(str(Path(__file__).with_name('eyewear.py')))['fit_frames'](
    head, material, stroke, oval, brass)
for s in (-1,1):
    for i in range(3):
        oval('Freckle',(s*(.31+i*.043),-.49+i*.034,.543+.021*(i%2)),(.009,.007,.007),lip,head)

arms=[]
for s in [-1,1]:
    shoulder=pivot('Shoulder_'+str(s),(s*.59,0,1.015),chest)
    e=(s*.27,-.10,-.51)
    sleeve('Jacket sleeve',(0,0,0),e,.218,.205,jacket,shoulder)
    elbow=pivot('Elbow_'+str(s),e,shoulder)
    w=(s*.092,-.40,.17)
    sleeve('Turned sleeve',(0,0,0),w,.162,.155,jacket,elbow)
    link('Cuff',tuple(Vector(w)*.82),w,.15,.151,trim,elbow)
    wrist=pivot('Wrist_'+str(s),w,elbow)
    sculpt('Glove palm',[(-.055,.072,.065,-.025),(-.016,.112,.084,-.04),
           (.072,.151,.09,-.05),(.157,.151,.082,-.055),(.21,.125,.067,-.052),
           (.238,.096,.047,-.05)],glove,wrist)
    for seam in (-.038, .038):
        stroke('Glove seam',[(seam,-.136,.084),(seam,-.144,.132),(seam,-.125,.19)],[.004,.006,.003],shirt,wrist)
    digits=[]
    for i,length in enumerate([.16,.205,.19,.145]):
        x=s*(-.114+i*.077)
        finger=pivot('Finger_%s_%s'%(s,i),(x,-.056,.215-.027*abs(i-1.35)),wrist)
        finger.rotation_euler.y=radians(s*(-9+i*6))
        link('Proximal phalanx',(0,0,0),(0,-.008,length*.57),.035,.036,glove,finger)
        tip=pivot('Distal_%s_%s'%(s,i),(0,-.008,length*.53),finger)
        link('Finger tip',(0,0,0),(0,-.012,length*.43),.030,.032,glove,tip)
        digits.append((finger,tip))
    thumb=pivot('Thumb_'+str(s),(-s*.105,-.048,.093),wrist)
    link('Thumb base',(0,0,0),(-s*.075,-.018,.067),.053,.048,glove,thumb)
    link('Thumb tip',(-s*.064,-.018,.058),(-s*.097,-.038,.143),.042,.040,glove,thumb)
    arms.append((s,shoulder,elbow,wrist,digits,thumb))

runpy.run_path(str(Path(__file__).with_name('continuous_skin.py')))['bind_costume'](
    chest, arms, jacket, glove)

# One continuous source timeline. The app blends the listening and speaking ranges.
def rot(ob,xyz,frame):
    ob.rotation_euler=tuple(radians(a) for a in xyz)
    ob.keyframe_insert(data_path='rotation_euler',frame=frame)


def beat(u,center,width):
    return exp(-((u-center)/width)**2)


def place_arm(side, shoulder, elbow, wrist, target, fingers, palm_normal):
    # Solve the elbow first. Let it travel toward the line behind the knuckles
    # while keeping it on its own side, rather than fixing a bent wrist in place.
    upper, lower = elbow.location.copy(), wrist.location.copy()
    reach = Vector(target) - shoulder.location
    direction = reach.normalized()
    distance = min(upper.length+lower.length-.008,max(.32,reach.length))
    reach = direction*distance
    pole = Vector((side*.65,-.12,-1))
    bend = (pole-direction*pole.dot(direction)).normalized()
    fingers = Vector(fingers).normalized()
    desired_pole = direction*fingers.dot(direction)-fingers
    steer = atan2(direction.dot(bend.cross(desired_pole)),max(.52,bend.dot(desired_pole)))
    bend = Quaternion(direction,limit(steer*.75,48)) @ bend
    along = (upper.length_squared-lower.length_squared+reach.length_squared)/(2*reach.length)
    to_elbow = along*direction + sqrt(max(0,upper.length_squared-along**2))*bend
    shoulder_q = upper.rotation_difference(to_elbow)
    forearm = (reach-to_elbow).normalized()
    swing = shoulder_q @ lower.rotation_difference(shoulder_q.inverted() @ forearm)
    rest_axis = lower.normalized()
    up = Vector((0,1,0))
    neutral = swing @ (up-rest_axis*up.dot(rest_axis)).normalized()
    requested = Vector(palm_normal)
    # An unreachable palm orientation relaxes toward neutral instead of jumping
    # between the two limits of forearm rotation at the atan2 branch cut.
    roll = 1.18*atan2(forearm.dot(neutral.cross(requested)),max(.40,neutral.dot(requested)))
    lower_world = Quaternion(forearm,limit(roll,83)) @ swing
    elbow_q = shoulder_q.inverted() @ lower_world
    palm_up = Quaternion(forearm,limit(roll,92)) @ neutral
    across = palm_up.cross(forearm).normalized()
    # Independent flexion and sideways deviation limits, in forearm space.
    ahead=max(.38,fingers.dot(forearm))
    flex=limit(atan2(fingers.dot(palm_up),ahead),38)
    deviation=limit(atan2(fingers.dot(across),ahead),16)
    knuckles=(forearm+tan(flex)*palm_up+tan(deviation)*across).normalized()
    across=palm_up.cross(knuckles).normalized()
    hand=Matrix((across,knuckles.cross(across),knuckles)).transposed().to_quaternion()
    wrist_q = lower_world.inverted() @ hand
    return shoulder_q,elbow_q,wrist_q


def limit(angle, degrees):
    return max(-radians(degrees),min(radians(degrees),angle))


def hand_placement(mode, side, u):
    if mode in ('speak','invite','focus'):
        lift=(beat(u,.30,.14)+.6*beat(u,.70,.12)) if mode=='speak' else beat(u,.46,.26)
        if mode=='focus':
            return ((side*.37,-.46,.59+.04*side),(-side*.40,-.46,.63),(0,-1,.1))
        lead=lift*(1 if side==1 else .24)
        return ((side*(.51+.14*lead),-.44-.18*lead,.59+.39*lead),
                (side*.28,-.60,.55+.23*lead),(.12*side,-.85+.54*lead,.40+.43*lead))
    if mode in ('offer','attend','pinpoint'):
        rest = Vector((side*.53,-.42,.54))
        rest_fingers = Vector((-side*.25,-.52,.65))
        if mode=='pinpoint':
            # The supporting palm provides a reference. The other hand marks
            # a beat in the space above it without pointing at the learner.
            amount = beat(u,.50,.34)
            tap = beat(u,.40,.07)+.68*beat(u,.61,.07)
            target = (.16,-.61,1.10-.13*tap) if side==1 else (-.33,-.54,.75)
            fingers = (-.78,-.1,-.48) if side==1 else (.84,-.36,.16)
            normal = (.05,-1,-.15) if side==1 else (0,-.16,1)
        elif mode=='attend':
            amount = beat(u,.49,.32)
            target = (side*.90,-.30,1.60) if side==-1 else (.39,-.46,.58)
            fingers = (-.19,-.18,.98) if side==-1 else (-.40,-.40,.62)
            normal = (-.43,-.90,.02) if side==-1 else (.65,-.62,0)
        else:
            amount = beat(u,.48,.31)
            target = (.62,-.68,.99) if side==1 else (-.46,-.41,.55)
            fingers = (.76,-.59,.30) if side==1 else (.40,-.40,.65)
            normal = (.10,-.45,.89) if side==1 else (-.65,-.65,0)
        return rest.lerp(Vector(target),amount),rest_fingers.lerp(Vector(fingers),amount),normal
    if mode in ('yawn','stretch'):
        # Ease in, hold, then release. The second shoulder follows the first.
        delay=.032 if mode=='stretch' and side==-1 else 0
        t=max(0,min(1,(u-delay)/.31))
        release=max(0,min(1,(1-u)/.29))
        amount=t*t*(3-2*t)*release*release*(3-2*release)
        start=Vector((side*.55,-.40,.51))
        if mode=='stretch':
            target=Vector((side*1.23,-.14,1.57+.07*side))
            fingers=(side*.82,-.10,.70)
            palm=(side*.17,-.95,-.1)
        elif side==1:
            target=Vector((.20,-.622,1.415))
            fingers=(-.51,-.21,.86)
            palm=(.48,-.84,-.18)
        else:
            target=Vector((-.38,-.45,.57))
            fingers=(.54,-.2,-.68)
            palm=(.65,-.70,0)
        direction=Vector((side*.2,-.55,.72)).lerp(Vector(fingers),amount)
        return (start.lerp(target,amount),direction,palm)
    if mode == 'listen':
        if side==1:
            return ((.48,-.40,.48),(-.48,-.32,-.73),(.68,-.58,0))
        return ((-.62,-.25,.37),(.25,-.41,-.84),(.7,-.45,0))
    if mode == 'fold':
        return ((-side*.07,-.64 if side==1 else -.54,.76 if side==1 else .59),
                (-side,.12,.36 if side==1 else .26),(0,-1,0))
    if mode == 'consider':
        if side==1:
            return ((.23,-.43,1.15),(-.34,-.06,.93),(.8,-.6,0))
        return ((.005,-.49,.70),(.96,.06,.25),(0,-1,0))
    if mode == 'lean':
        # One hand rests over the other, with space between the gloves.
        return ((side*.26,-.54-.065*side,.51+.065*side),(-side,.05,.23),(0,-1,0))
    if mode == 'explain':
        lift=beat(u,.24 if side==-1 else .58,.18)
        return ((side*(.54+.14*lift),-.51-.12*lift,.73+.20*lift),
                (side*(.34+.26*lift),-.88,.30+.40*lift),(0,.22,1))
    return None


for first,count,mode in [(1,96,'listen'),(98,144,'speak'),(244,48,'invite'),
                         (294,180,'focus'),(476,118,'fold'),(596,144,'explain'),
                         (742,144,'lean'),(888,132,'consider'),(1022,108,'yawn'),
                         (1132,144,'stretch'),(1278,58,'offer'),(1338,94,'attend'),
                         (1434,96,'pinpoint')]:
    talking = mode in ('speak','explain','pinpoint')
    inviting = mode == 'invite'
    focusing = mode == 'focus'
    folded = mode == 'fold'
    for f in sorted(set(range(0,count+1,2)) | {count}):
        u=f/count
        angle=2*pi*u
        frame=first+f
        breath=sin(angle)
        accent=(beat(u,.30,.115)+.66*beat(u,.70,.095)) if talking else 0
        if inviting:
            accent=beat(u,.45,.29)
        leaning = mode == 'lean'
        thinking = mode == 'consider'
        shift = beat(u,.56,.24)
        yawn=beat(u,.49,.195) if mode=='yawn' else 0
        stretch=beat(u,.50,.26) if mode=='stretch' else 0
        ear=beat(u,.47,.30) if mode=='attend' else 0
        offer=beat(u,.46,.28) if mode=='offer' else 0
        rot(chest,(.8*breath-1.6*accent+(9+2*shift if leaning else 0)-5*stretch+5*ear+3*offer,
                   -1+.7*breath+(4 if thinking else 0)-3*ear,-2+2*accent-(5 if leaning else 0)+5*offer),frame)
        nod = (13*beat(u,.18,.052)-3*beat(u,.26,.045)
               +7*beat(u,.33,.052)+10*beat(u,.80,.065)) if focusing else 0
        attention = (.45+.55*beat(u,.63,.21)) if focusing else 0
        cheeks.value=.09+.30*accent+.16*attention+.12*beat(u,.67,.17)
        cheeks.keyframe_insert(data_path='value',frame=frame)
        rot(head,(-2+.7*breath-2*accent+nod+2*attention-9*yawn-5*stretch+(-5+7*beat(u,.36,.08) if leaning else 0),
                  1+1.2*accent+3*attention+(2 if folded else 0)+(3*shift if thinking else 0)-12*ear,
                  2+1.2*sin(angle)-3*attention+(7*shift if thinking else 0)),frame)
        glance=beat(u,.47,.12) if thinking else .29*beat(u,.34,.09)
        for gaze in gazes:
            rot(gaze,(6*glance,0,-9*glance+2*sin(angle)),frame)
        for s,lid in upper_lids:
            blink_at=.78 if talking else .57
            blink=beat(u,blink_at+s*.002,.018 if u<blink_at else .033)
            rest=-50+attention*(23 if s==1 else 20)+(7 if leaning or thinking else 0)
            rot(lid,(rest+(88-rest)*max(blink,.91*yawn,.30*stretch),0,0),frame)
        mouth=(.45+.55*sin(10*angle+.4))*(.70+.30*sin(3*angle)) if talking else 0
        speech_shape.value=max(0,mouth,yawn)
        speech_shape.keyframe_insert(data_path='value',frame=frame)
        for side,brow in brows:
            rot(brow,(0,side*(1+accent*4-2*attention),0),frame)
        for s,shoulder,elbow,wrist,digits,thumb in arms:
            lead=1 if s==1 else .22
            gesture=accent*lead
            placement=hand_placement(mode,s,u)
            rotations=place_arm(s,shoulder,elbow,wrist,*placement)
            for joint,rotation in zip((shoulder,elbow,wrist),rotations):
                joint.rotation_mode='QUATERNION'
                rotation.make_compatible(joint.rotation_quaternion)
                joint.rotation_quaternion=rotation
                joint.keyframe_insert(data_path='rotation_quaternion',frame=frame)
            for i,(finger,tip) in enumerate(digits):
                spread=(beat(u,.336+i*.015,.13)+.66*beat(u,.73+i*.009,.11))*lead if talking else 0
                if inviting:
                    spread=beat(u,.49+i*.019,.26)*lead
                curl = 8+i*2 if placement else 18+i*4-30*spread
                if thinking and s==1:
                    curl=5+9*i
                if mode=='pinpoint' and s==1:
                    curl+=beat(u,.49,.28)*(34 if i>0 else -12)
                if mode=='offer' and s==1:
                    curl-=12*beat(u,.47+i*.018,.22)
                if mode=='attend' and s==-1:
                    curl+=ear*(6+i*3)
                rot(finger,(curl,s*(-12+i*7)*(1+.45*spread),0),frame)
                rot(tip,(curl*.8+4 if placement else 27+i*2-23*spread,0,0),frame)
            rot(thumb,(8-11*gesture,-s*(4+10*gesture),0),frame)

scene.frame_set(1)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=str(OUT/'cue.glb'),export_format='GLB',use_selection=True,
    export_apply=True,export_animation_mode='SCENE',export_frame_range=True,export_frame_step=2,
    export_anim_scene_split_object=False,export_optimize_animation_size=False,export_cameras=False,export_lights=False)


def aim(ob,target):
    ob.rotation_euler=(Vector(target)-ob.location).to_track_quat('-Z','Y').to_euler()


bpy.ops.object.camera_add(location=(.68,-6.7,2.06))
cam=bpy.context.object
aim(cam,(0,-.05,1.49))
cam.data.type,cam.data.ortho_scale='ORTHO',3.70
scene.camera=cam
for name,loc,energy,size,color in [
    ('Softbox',(-3,-4,5),430,4,(1,.87,.74)),('Fill',(3,-3,3),280,3,(.77,.91,1)),('Edge',(1,2,4),530,2.8,(1,.80,.62))]:
    bpy.ops.object.light_add(type='AREA',location=loc)
    ob=bpy.context.object
    ob.name=name
    ob.data.energy,ob.data.shape,ob.data.size,ob.data.color=energy,'DISK',size,color
    aim(ob,(0,0,1.4))
scene.timeline_markers.new('Listen',frame=1)
scene.timeline_markers.new('Speak',frame=98)
scene.timeline_markers.new('Offer the floor',frame=244)
scene.timeline_markers.new('Attentive nod and eyelids',frame=294)
scene.timeline_markers.new('Wait with folded arms',frame=476)
scene.timeline_markers.new('Explain with open palms',frame=596)
scene.timeline_markers.new('Lean in to listen',frame=742)
scene.timeline_markers.new('Rest a hand by the chin',frame=888)
scene.timeline_markers.new('Cover a yawn',frame=1022)
scene.timeline_markers.new('Stretch and relax',frame=1132)
scene.timeline_markers.new('Offer an open palm',frame=1278)
scene.timeline_markers.new('Turn an ear toward the learner',frame=1338)
scene.timeline_markers.new('Mark a detail above the palm',frame=1434)
scene.render.use_freestyle=True
lines=bpy.context.view_layer.freestyle_settings.linesets
outside=lines[0]
outside.name='Outer silhouette'
outside.select_silhouette=False
outside.select_crease=False
outside.select_border=False
outside.select_external_contour=True
outside.linestyle=bpy.data.linestyles.new('Cue silhouette ink')
outside.linestyle.color=(.017,.020,.030)
outside.linestyle.thickness=5.2
inside=lines.new('Overlapping shapes')
inside.select_crease=False
inside.select_border=False
inside.select_silhouette=True
inside.linestyle=bpy.data.linestyles.new('Cue interior ink')
inside.linestyle.color=(.035,.030,.033)
inside.linestyle.thickness=1.6
scene.render.filepath=str(OUT/'cue.png')
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(Path(__file__).with_name('Cue.blend')), compress=True)
bpy.ops.render.render(write_still=True)
