"""A continuous facial surface with a recessed mouth and deformable lip edges."""
from math import cos, exp, pi, sin

import bpy
import numpy as np
from mathutils import Vector


PROFILE = [
    (.055,.14,.19,-.09),(.12,.265,.258,-.09),(.23,.415,.315,-.08),
    (.36,.535,.355,-.068),(.49,.608,.373,-.066),(.60,.65,.38,-.06),
    (.72,.655,.382,-.048),(.84,.636,.394,-.039),(1.0,.625,.411,-.025),
    (1.17,.65,.428,.008),(1.29,.61,.416,.028),(1.40,.485,.353,.049),
    (1.485,.32,.258,.056),(1.53,.12,.118,.052),(1.535,.015,.018,.05)]


def bump(x,z,cx,cz,rx,rz):
    return exp(-((x-cx)/rx)**2-((z-cz)/rz)**2)


def seam(x):
    return .002+.008*exp(-((abs(x)-.054)/.045)**2)+.006*min(1,abs(x)/.21)**1.8


def face_depth(x,z):
    a=abs(x)
    malar=.110*bump(a,z,.33,.61,.145,.119)
    hollow=-.043*bump(a,z,.37,.455,.13,.101)
    eye_socket=-.042*bump(a,z,.225,.8,.17,.1)
    brow=.047*bump(a,z,.235,.985,.158,.071)
    nose=(.099*bump(x,z,0,.71,.083,.19)+.105*bump(x,z,0,.617,.096,.063)
          +.063*bump(a,z,.085,.593,.035,.045)-.042*bump(a,z,.061,.573,.022,.024))
    muzzle=(.052*bump(x,z,0,.43,.235,.12)+.016*bump(a,z,.038,.505,.021,.053)
            -.014*bump(x,z,0,.50,.022,.047))
    lips=(.042*bump(a,z,.063,.439,.109,.022)+.047*bump(x,z,0,.390,.143,.029)
          -.023*bump(a,z,.198,.42,.036,.036))
    chin=.047*bump(x,z,0,.251,.17,.073)-.024*bump(x,z,0,.325,.15,.030)
    return malar+hollow+eye_socket+brow+nose+muzzle+lips+chin


def build_face(head, skin, mouth, hair):
    n=128
    profile=np.array(PROFILE)
    zs=sorted(set(np.round(np.arange(.055,1.535,.023),4)).union(
        [.373,.385,.397,.405,.411,.421,.429,.439,.449,.462,1.535]))
    zs=[z for z in zs if not .411<z<.421]
    lower=zs.index(.411)
    verts,faces=[],[]
    for z in zs:
        rx,ry,cy=[np.interp(z,profile[:,0],profile[:,k]) for k in (1,2,3)]
        for i in range(n):
            ang=2*pi*i/n
            x=rx*cos(ang)
            front=max(0,-sin(ang))
            y=cy+ry*sin(ang)-face_depth(x,z)*front**3
            lip_curve=seam(x)*bump(x,z,0,.416,.255,.074)*front**4
            pinch=.72*min(1,abs(x)/.19)**2*exp(-((z-.416)/.023)**2)*front**4
            verts.append((x+.009*sin(z*pi)*front,y,z+lip_curve-(z-.416)*pinch))
    left,right=3*n//4-8,3*n//4+8
    for j in range(len(zs)-1):
        for i in range(n):
            if j==lower and left<=i<right:
                continue
            k=(i+1)%n
            faces.append((j*n+i,j*n+k,(j+1)*n+k,(j+1)*n+i))
    faces.extend([tuple(reversed(range(n))),tuple(range(len(verts)-n,len(verts)))])
    outer_count=len(faces)
    rim=[lower*n+i for i in range(left,right+1)]
    rim.extend((lower+1)*n+i for i in range(right,left-1,-1))
    inner=[]
    for idx in rim:
        x,y,z=verts[idx]
        inner.append(len(verts))
        verts.append((x*.94,y+.070,z))
    for i in range(len(rim)):
        k=(i+1)%len(rim)
        faces.append((rim[i],rim[k],inner[k],inner[i]))
    faces.append(tuple(inner))
    mesh=bpy.data.meshes.new('Face with connected lip rim')
    mesh.from_pydata(verts,[],faces)
    face=bpy.data.objects.new('Face',mesh)
    bpy.context.collection.objects.link(face)
    face.parent=head
    complexion=skin.copy()
    complexion.name='Complexion and lip colour'
    colors=mesh.color_attributes.new(name='Complexion',type='FLOAT_COLOR',domain='POINT')
    base=np.array(skin.diffuse_color[:3])
    lip=base*np.array([.81,.55,.54])
    for i,(x,y,z) in enumerate(verts):
        w=0
        if y<-.24:
            w=min(.90,.75*bump(x,z,0,.407+seam(x),.155,.041))
        colors.data[i].color=(*((1-w)*base+w*lip),1)
    color=complexion.node_tree.nodes.new('ShaderNodeVertexColor')
    color.layer_name='Complexion'
    complexion.node_tree.links.new(color.outputs['Color'],complexion.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])
    mesh.materials.append(complexion)
    mesh.materials.append(mouth)
    for polygon in mesh.polygons:
        polygon.use_smooth=True
        polygon.material_index=int(polygon.index>=outer_count)
    bpy.context.view_layer.objects.active=face
    smooth=face.modifiers.new('Lip and cheek topology','SUBSURF')
    smooth.levels=1
    bpy.ops.object.modifier_apply(modifier=smooth.name)
    face.shape_key_add(name='Neutral')
    cheeks=face.shape_key_add(name='Cheek lift and lip corners')
    speech=face.shape_key_add(name='Jaw and lip separation')
    for v,jaw in zip(cheeks.data,speech.data):
        x,y,z=v.co
        if y>-.21:
            continue
        weight=bump(abs(x),z,.29,.525,.16,.135)
        v.co+=Vector((x*.060,-.029,.051))*weight
        delta=z-(.416+seam(x)*exp(-(x/.255)**2))
        lower_lip=1/(1+exp(min(50,delta/.0025)))
        opening=bump(x,z,0,.404,.16,.128)
        jaw.co+=Vector((-x*.05,-.009,.018-.101*lower_lip))*opening
    # Close-cropped hair follows the skull rather than extending into a quiff.
    nv,nr=112,28
    cap=[]
    for row in range(nr):
        t=row/(nr-1)
        for i in range(nv):
            a=2*pi*i/nv
            front=max(0,-sin(a))
            base_z=.77+.392*min(1,front*1.55)**1.15+.028*sin(9*a+.7)*front+.012*sin(20*a)*front
            z=base_z+(1.535-base_z)*t
            rx,ry,cy=[np.interp(z,profile[:,0],profile[:,k]) for k in (1,2,3)]
            texture=(.008*sin(24*a+4*t)+.005*sin(49*a+8*t))*sin(pi*t)
            thickness=.013+.023*sin(pi*t)+texture
            cap.append(((rx+thickness)*cos(a),cy+(ry+thickness)*sin(a),z+.027*t))
    quads=[(r*nv+i,r*nv+(i+1)%nv,(r+1)*nv+(i+1)%nv,(r+1)*nv+i)
           for r in range(nr-1) for i in range(nv)]
    quads.append(tuple(range(len(cap)-nv,len(cap))))
    mesh=bpy.data.meshes.new('Cropped hair')
    mesh.from_pydata(cap,[],quads)
    ob=bpy.data.objects.new('Short textured crop',mesh)
    bpy.context.collection.objects.link(ob)
    ob.parent=head
    mesh.materials.append(hair)
    for p in mesh.polygons:
        p.use_smooth=True
    hem=ob.modifiers.new('Hairline edge','SOLIDIFY')
    hem.thickness=.016
    return cheeks,speech
